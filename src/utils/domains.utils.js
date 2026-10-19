import { getDomain } from "tldts";
import { EXCLUDED_DOMAINS } from "../constants/query.constant.js";

const normalizeDomain = (rawUrl) => {
  try {
    const url = new URL(
      rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`,
    );
    const hostname = url.hostname.toLowerCase();
    const domain = getDomain(hostname);

    if (
      !domain ||
      EXCLUDED_DOMAINS.has(hostname) ||
      [...EXCLUDED_DOMAINS].some((excluded) =>
        hostname.endsWith(`.${excluded}`),
      )
    ) {
      return null;
    }

    return domain;
  } catch {
    return null;
  }
};

export function normalizeAndFilterDomains(urls) {
  const domains = new Set();
  for (const rawUrl of urls) {
    const domain = normalizeDomain(rawUrl);
    if (domain) domains.add(domain);
  }
  return [...domains];
}

export function filterAndDeduplicateResults(results) {
  const seenDomains = new Set();
  const filteredResults = [];

  for (const result of results) {
    const domain = normalizeDomain(result.url);
    if (!domain || seenDomains.has(domain)) {
      continue;
    }

    seenDomains.add(domain);
    filteredResults.push({ ...result, domain });
  }

  return filteredResults;
}
