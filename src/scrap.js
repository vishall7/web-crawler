import { writeFile, readFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { CheerioCrawler, Configuration } from "crawlee";
import { ImpitHttpClient, Browser } from "@crawlee/impit-client";
import {
  CONTACT_LINK_RE,
  CONTACT_PAGE_PATHS,
  MAX_DEEP_LINKS,
} from "./constants/query.constant.js";
import { extractEmails } from "./utils/emails.utils.js";

Configuration.getGlobalConfig().set("persistStorage", false);

const sites = [
  "https://www.neelnetworks.com/",
  // paste site root URLs here
];
const emailsBySite = new Map();
const triedBySite = new Map();
const seenEmails = new Set();
const outputPath = resolve("emails.json");
const temporaryOutputPath = `${outputPath}.tmp`;
let outputWrite = Promise.resolve();
const origin = (u) => new URL(u).origin;
const getSet = (map, key) => {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  return set;
};
const track = (url) => getSet(triedBySite, origin(url)).add(url);
const loadExistingEmails = async () => {
  try {
    const items = JSON.parse(await readFile(outputPath, "utf8"));
    if (!Array.isArray(items)) {
      throw new Error(`Expected ${outputPath} to contain a JSON array`);
    }

    items.forEach((item) => {
      if (typeof item?.email === "string") seenEmails.add(item.email);
    });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};

const flushOutput = () => {
  outputWrite = outputWrite.then(async () => {
    const items = [...seenEmails].map((email) => ({ email }));
    await writeFile(temporaryOutputPath, JSON.stringify(items, null, 2));
    await rename(temporaryOutputPath, outputPath);
  });
  return outputWrite;
};

const add = async (url, list) => {
  const set = getSet(emailsBySite, origin(url));
  for (const email of list) {
    set.add(email);

    if (seenEmails.has(email)) continue;
    seenEmails.add(email);
  }
};

await loadExistingEmails();
const outputInterval = setInterval(() => {
  void flushOutput().catch((error) => {
    console.error(`Failed to write ${outputPath}:`, error);
  });
}, 1000);

// 1) Cheerio pass
const cheerioCrawler = new CheerioCrawler({
  httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
  maxConcurrency: 30,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 20,
  ignoreHttpErrorStatusCodes: [404],
  async requestHandler({ request, $, response, crawler }) {
    if (response.statusCode === 404) return;
    track(request.url);

    const found = extractEmails($);
    const foundEmail = found.length > 0;
    const isDeepPage = request.userData.deep === true;

    if (foundEmail) {
      await add(request.url, found);
      console.log(`[Cheerio] Found ${found.length} email(s) on ${request.url}`);
    } else if (!isDeepPage) {
      const siteOrigin = origin(request.url);
      const links = new Set();
      $("a[href]").each((_, el) => {
        try {
          const url = new URL($(el).attr("href"), request.url);
          if (
            url.origin === siteOrigin &&
            CONTACT_LINK_RE.test(url.pathname)
          ) {
            links.add(url.href.split("#")[0]);
          }
        } catch {}
      });

      const nextUrls = links.size
        ? [...links].slice(0, MAX_DEEP_LINKS)
        : CONTACT_PAGE_PATHS.map((path) => siteOrigin + path);
      await crawler.addRequests(
        nextUrls.map((url) => ({ url, userData: { deep: true } })),
      );
    }
  },
  failedRequestHandler({ request }) {
    track(request.url);
  },
});
await cheerioCrawler.run(sites);

// 2) Playwright fallback only for sites still without an email
const missingSites = sites.filter(
  (site) => !emailsBySite.get(origin(site))?.size,
);
const pending = new Set();
missingSites.forEach((site) => {
  pending.add(site);
  const siteOrigin = origin(site);
  triedBySite.get(siteOrigin)?.forEach((url) => pending.add(url));
});

if (pending.size) {
  const { PlaywrightCrawler } = await import("crawlee");
  const playwrightCrawler = new PlaywrightCrawler({
    maxConcurrency: 5,
    maxRequestRetries: 1,
    preNavigationHooks: [
      async ({ page }) => {
        await page.route("**/*", (route) =>
          ["image", "font", "media", "stylesheet"].includes(
            route.request().resourceType(),
          )
            ? route.abort()
            : route.continue(),
        );
      },
    ],
    async requestHandler({ request, parseWithCheerio }) {
      const $ = await parseWithCheerio();
      await add(request.url, extractEmails($));
    },
  });
  await playwrightCrawler.run(
    [...pending].map((url) => ({ url, uniqueKey: `${url}#pw` })),
  );
}

clearInterval(outputInterval);
await flushOutput();

for (const [site, set] of emailsBySite) {
  console.log(site, [...set]);
}
