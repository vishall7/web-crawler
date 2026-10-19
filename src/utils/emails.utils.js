import {
  ALLOW_LOCAL,
  EXCLUDE_LOCAL,
} from "../constants/email.constant.js";

const EMAIL_RE =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const EMAIL_VALID_RE = new RegExp(EMAIL_RE.source, "i");
const JUNK_RE =
  /\.(png|jpe?g|gif|svg|webp|css|js)$|@2x|sentry|wixpress|example\.com/i;
const MAILTO_RE = /^mailto:/i;
const GMAIL_RE = /mail\.google\.com/i;
const isAllowed = (email) => ALLOW_LOCAL.has(email.split("@")[0]);
const isExcluded = (email) => {
  const local = email.split("@")[0].replace(/[+].*$/, "");
  return EXCLUDE_LOCAL.has(local);
};

const decode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const decodeCloudflareEmail = (hex) => {
  if (!/^[a-f\d]+$/i.test(hex) || hex.length < 2) return "";
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let email = "";

  for (let index = 2; index < hex.length; index += 2) {
    email += String.fromCharCode(
      Number.parseInt(hex.slice(index, index + 2), 16) ^ key,
    );
  }

  return email;
};

const normalizeEmails = (values) =>
  [...new Set(values.flatMap((value) => value.split(",")))]
    .map((value) => value.trim().toLowerCase())
    .filter((email) => {
      return (
        isAllowed(email) &&
        !isExcluded(email) &&
        EMAIL_VALID_RE.test(email) &&
        !JUNK_RE.test(email)
      );
    });

const extractStructuredEmails = ($) => {
  const found = [];

  $("a[href^='mailto:']").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;

    const address = href.replace(MAILTO_RE, "").split("?")[0];
    found.push(...decode(address).split(","));
  });

  $("[data-cfemail]").each((_, element) => {
    const encoded = $(element).attr("data-cfemail");
    if (encoded) found.push(decodeCloudflareEmail(encoded));
  });

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href || !GMAIL_RE.test(href)) return;

    try {
      const address = new URL(href, "https://mail.google.com")
        .searchParams.get("to");
      if (address) found.push(...decode(address).split(","));
    } catch {
      // Ignore malformed links and continue extracting other addresses.
    }
  });

  return normalizeEmails(found);
};

const extractVisibleTextEmails = ($) =>
  normalizeEmails($("body").text().match(EMAIL_RE) || []);

export const extractEmails = ($) => {
  const structuredEmails = extractStructuredEmails($);
  return structuredEmails.length
    ? structuredEmails
    : extractVisibleTextEmails($);
};
