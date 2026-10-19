import { SERVICES } from "../constants/query.constant.js";

export function generateSearchQueries({ target, services = SERVICES }) {
  if (!target?.name || !["city", "state"].includes(target.type)) {
    throw new Error(
      'Provide target as { type: "city" | "state", name: "..." }',
    );
  }

  const location = target.name.trim();
  if (!location) throw new Error("Target location cannot be empty");

  const queries = new Set();
  for (const phrases of Object.values(services)) {
    for (const phrase of phrases) {
      queries.add(`${phrase} in ${location} India`);
    }
  }

  return [...queries];
}
