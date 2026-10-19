const DEFAULT_SEARXNG_URL = "http://localhost:8080";

const normalizeResult = (result, query) => ({
  title: typeof result.title === "string" ? result.title.trim() : "",
  url: typeof result.url === "string" ? result.url.trim() : "",
  snippet:
    typeof result.content === "string"
      ? result.content.trim()
      : typeof result.snippet === "string"
        ? result.snippet.trim()
        : "",
  query,
});

export async function searchSearXNG(
  queries,
  baseUrl = process.env.SEARXNG_URL ?? DEFAULT_SEARXNG_URL,
) {
  const endpoint = new URL("/search", `${baseUrl.replace(/\/+$/, "")}/`);
  const results = [];

  for (const query of queries) {
    endpoint.search = new URLSearchParams({
      q: query,
      format: "json",
    });

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(
        `SearXNG request failed for "${query}" (${response.status} ${response.statusText})`,
      );
    }

    const data = await response.json();
    if (!Array.isArray(data.results)) {
      throw new Error(`SearXNG returned an invalid result for "${query}"`);
    }

    results.push(
      ...data.results
        .map((result) => normalizeResult(result, query))
        .filter((result) => result.url),
    );
  }

  return results;
}
