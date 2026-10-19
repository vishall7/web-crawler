import { SERVICES } from "./constants/query.constant.js";
import { generateSearchQueries } from "./utils/preparequeries.js";
import { filterAndDeduplicateResults } from "./utils/domains.utils.js";
import { searchSearXNG } from "./utils/searxng.utils.js";

const queries = generateSearchQueries({
  target: {
    type: "city",
    name: "Pune",
  },
  services: SERVICES,
});

const searchResults = await searchSearXNG(queries);
const companyResults = filterAndDeduplicateResults(searchResults);

console.log(JSON.stringify(companyResults, null, 2));
