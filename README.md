# web-crawler

I’ll inspect the current query preparation and crawler entry points so the plan matches the existing flow, then I’ll outline the directory-pagination architecture, improvements, and whether multiple queries are necessary.

Read
Completed with input: {
"path": "C:\\Users\\vipul\\Desktop\\Vishal\\web-scrapper\\src\\utils\\preparequeries.js"
}

Read
Completed with input: {
"path": "C:\\Users\\vipul\\Desktop\\Vishal\\web-scrapper\\src\\domains.js"
}

Read , lines 1 to 55
Completed with input: {
"path": "C:\\Users\\vipul\\Desktop\\Vishal\\web-scrapper\\src\\http_crawler.js",
"view_range": [
1,
55
]
}

## Proposed plan

### 1. Discover GoodFirms directory pages

Use the existing query generation in `preparequeries.js` to find relevant GoodFirms directory URLs.

For example:

```text
web development companies in Pune India
digital marketing companies in Pune India
SEO companies in Pune India
```

From the search results, keep only valid GoodFirms directory/listing URLs and remove duplicates.

The discovery flow is already started in `domains.js`.

---

### 2. Open each directory with Playwright

GoodFirms directory pages may use JavaScript to render listings and pagination. For those pages:

- Open the page with `PlaywrightCrawler`.
- Wait for the listing container to appear.
- Inspect the live DOM.
- Identify:
  - Listing card selector
  - Company name
  - Company profile URL
  - Location
  - Services
  - Rating
  - Review count
  - Minimum project size
  - Hourly rate
  - Employee count
  - Pagination controls
- Do not save the complete HTML page to disk.
- Extract only the required listing data and links from the page.

The browser still downloads the page internally, but we do not need to persist the page HTML.

---

### 3. Handle pagination

Pagination should be handled in this order:

#### Preferred: follow a real next-page URL

If the page contains links such as:

```html
<a href="/directory/.../page/2">Next</a>
```

extract and enqueue the URL directly.

This is more reliable than clicking because it allows Crawlee to manage retries, deduplication, and concurrency.

#### Fallback: click the Next button

If the next page is generated dynamically:

- Locate the next button.
- Check whether it is disabled or hidden.
- Click it with Playwright.
- Wait for the listing cards to change.
- Extract the new cards.
- Continue until:
  - There is no next button.
  - The next button is disabled.
  - The page number no longer changes.
  - No new company URLs are found.
  - A safety maximum page limit is reached.

A page limit is important to avoid infinite loops caused by broken pagination.

---

### 4. Switch back to HTTP/Cheerio for company profiles

After collecting profile URLs from the GoodFirms directory:

- Send the profile URLs to the HTTP/Cheerio crawler.
- Download each profile page.
- Extract the required fields from the HTML.
- Use Playwright only when the profile data is not present in the initial HTML or requires JavaScript rendering.

This gives us a hybrid crawler:

```text
Search discovery
        ↓
Playwright directory crawler
        ↓
Extract profile URLs and listing metadata
        ↓
HTTP/Cheerio profile crawler
        ↓
Playwright fallback for dynamic profiles
        ↓
JSON output
```

This is more efficient than opening every company profile with Playwright.

---

### 5. Store structured results

Each result should have a stable schema, for example:

```json
{
  "source": "goodfirms",
  "directoryUrl": "...",
  "profileUrl": "...",
  "companyName": "...",
  "location": "...",
  "services": [],
  "rating": null,
  "reviewCount": null,
  "minimumProjectSize": null,
  "hourlyRate": null,
  "employees": null,
  "website": null,
  "emails": [],
  "phoneNumbers": [],
  "scrapedAt": "..."
}
```

Use `profileUrl` as the primary deduplication key.

Results should be flushed to the JSON file periodically, just like the email crawler, so a crash does not lose already processed listings.

---

## Improvements to the plan

### Use selectors with fallback strategies

Do not rely on one CSS selector. GoodFirms may change its markup.

Use several strategies:

1. Stable semantic attributes.
2. Link patterns.
3. Class selectors.
4. Text-based fallback.
5. Structured data such as JSON-LD, when available.

For example, company information may be available in:

- Visible cards.
- Profile links.
- `<script type="application/ld+json">`.
- Meta tags.

---

### Separate directory extraction from profile extraction

Do not combine both responsibilities in one handler.

Recommended components:

```text
goodfirms-directory.js
goodfirms-profile.js
goodfirms-selectors.js
result-writer.js
```

This makes it easier to update directory selectors without affecting company profile extraction.

---

### Add checkpointing

For long crawls, save:

- Directory pages already processed.
- Profile URLs discovered.
- Profile URLs already completed.
- Last successful page number.

This allows the crawler to restart without beginning from page one.

---

### Add duplicate and loop protection

Track:

```text
processedDirectoryUrls
processedProfileUrls
seenCompanyNames
seenPageSignatures
```

A page signature can be created from the first few company profile URLs on the page. If the same signature appears twice, pagination is probably looping.

---

### Respect rate limits

Use:

- Low concurrency for GoodFirms.
- A delay between page requests.
- Retries with backoff.
- A maximum number of pages per directory.
- Playwright only when required.

This will reduce blocking and unnecessary browser usage.

---

### Validate extracted data

Before saving:

- Confirm the profile URL belongs to GoodFirms.
- Normalize URLs.
- Trim whitespace.
- Normalize ratings and review counts.
- Convert missing values to `null`.
- Validate emails and phone numbers.
- Preserve raw text when parsing fails instead of silently discarding it.

---

## Do we need multiple queries?

### Short answer

**Yes, if you want broad coverage across multiple services or locations.**

The current query generator creates multiple queries because each service/location combination can return different GoodFirms directory pages. For example:

```text
web development companies in Pune India
SEO companies in Pune India
mobile app development companies in Pune India
```

A single query may not find all relevant directory categories.

### However, multiple queries are not needed for pagination

Once one GoodFirms directory URL is found, pagination should be handled by the directory crawler. You should not run a new search query for every page.

The flow should be:

```text
One search query
    ↓
One GoodFirms directory
    ↓
Page 1 → Page 2 → Page 3 → ...
```

### Recommended query strategy

Use one query for every meaningful:

```text
service × location
```

combination.

For example:

```text
services = [
  "web development",
  "SEO",
  "digital marketing"
]

locations = [
  "Pune",
  "Mumbai"
]
```

This produces six discovery queries:

```text
web development in Pune India
SEO in Pune India
digital marketing in Pune India
web development in Mumbai India
SEO in Mumbai India
digital marketing in Mumbai India
```

Then deduplicate the resulting GoodFirms directory URLs.

### Better long-term approach

If GoodFirms has predictable category and location URLs, direct URL generation would be better than search-engine discovery:

```text
GoodFirms category URL
+
location URL
+
pagination
```

That would reduce:

- Search-engine dependency.
- Duplicate results.
- Unrelated results.
- Query volume.

Search queries should then be used only as a fallback to discover new or unknown directory URL patterns.
