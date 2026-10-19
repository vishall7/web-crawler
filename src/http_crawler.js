import { HttpCrawler, PlaywrightCrawler } from "crawlee";
import { ImpitHttpClient, Browser } from "@crawlee/impit-client";

const sites = [
  "https://www.neelnetworks.com/",
  // paste site root URLs here
];
const paths = [
  "/contact",
  "/contact-us",
  "/about",
  "/about-us",
  "/support",
  "/team",
];

const LINK_RE =
  /href=["']([^"'#]*(?:contact|about|support|team|reach|get-in-touch)[^"'#]*)["']/gi;
const VALID_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const JUNK_RE = /\.(png|jpe?g|gif|svg|webp)$|@2x|sentry|wixpress|example\.com/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

const emailsBySite = {};
const tried = {};
const origin = (u) => new URL(u).origin;
const track = (url) => (tried[origin(url)] ??= new Set()).add(url);
const add = (url, list) => {
  const set = (emailsBySite[origin(url)] ??= new Set());
  list.forEach((e) => set.add(e));
};
const dec = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const decodeCf = (hex) => {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2)
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
};

// one extractor for raw HTML (used by both crawlers)
const extract = (html) => {
  const found = [];

  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    found.push(...dec(m[1]).split(","));
  }

  for (const m of html.matchAll(
    /mail\.google\.com[^"'\s>]*?(?:[?&]|;)to=([^&"'\s>]+)/gi,
  )) {
    found.push(...dec(m[1]).split(","));
  }

  for (const m of html.matchAll(/data-cfemail="([a-f0-9]+)"/gi)) {
    found.push(decodeCf(m[1]));
  }

  found.push(...(html.match(EMAIL_RE) || []));

  return [...new Set(found.map((email) => email.trim().toLowerCase()))].filter(
    (email) => VALID_RE.test(email) && !JUNK_RE.test(email),
  );
};

// 1) HTTP pass: no DOM, regex only
const httpCrawler = new HttpCrawler({
  httpClient: new ImpitHttpClient({ browser: Browser.Chrome }),
  maxConcurrency: 30,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: 20,
  ignoreHttpErrorStatusCodes: [404],
  async requestHandler({ request, body, response, crawler }) {
    if (response.statusCode === 404) return;
    track(request.url);

    const html = body.toString();
    const found = extract(html);
    if (found.length) return add(request.url, found);
    if (request.userData.deep) return;

    // no email on homepage -> find contact-like links
    const o = origin(request.url);
    const links = new Set();
    for (const m of html.matchAll(LINK_RE)) {
      try {
        const u = new URL(m[1], request.url);
        if (u.origin === o) links.add(u.href);
      } catch {}
    }
    const next = links.size ? [...links].slice(0, 5) : paths.map((p) => o + p);
    await crawler.addRequests(
      next.map((url) => ({ url, userData: { deep: true } })),
    );
  },
  failedRequestHandler({ request }) {
    track(request.url);
  },
});
await httpCrawler.run(sites);

// 2) Playwright fallback + parseWithCheerio
const missing = sites.filter((s) => !emailsBySite[origin(s)]?.size);
const pending = [
  ...new Set(missing.flatMap((s) => [s, ...(tried[origin(s)] ?? [])])),
];

if (pending.length) {
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
      add(request.url, extract($.html()));
    },
  });
  await playwrightCrawler.run(
    pending.map((url) => ({ url, uniqueKey: `${url}#pw` })),
  );
}

for (const [site, set] of Object.entries(emailsBySite)) {
  console.log(site, [...set]);
}
