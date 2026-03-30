export const AI_SAMPLE_PROMPT = `Trip: Goa Spring Break
Members: Janmejaya, Priya, Rahul, Neha
Hotel booking 18000 paid by Janmejaya split among all
Scooter rental 3200 paid by Rahul split among Janmejaya, Rahul, Neha
Dinner shack 2400 paid by Priya split 40% Priya 30% Rahul 30% Neha
Beach tickets 1200 paid by Neha split shares Janmejaya:1 Rahul:2 Neha:1`;

export const EMPTY_CONFIG_HEALTH = {
  ok: true,
  score: 0,
  summary: "",
  counts: { ok: 0, warn: 0, fail: 0, total: 0 },
  checks: [],
};

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD", "CAD"];

export function currencySymbol(currency) {
  if (currency === "GBP") return "GBP ";
  if (currency === "AED") return "AED ";
  if (currency === "SGD") return "SGD ";
  if (currency === "JPY") return "JPY ";
  if (currency === "AUD") return "AUD ";
  if (currency === "CAD") return "CAD ";
  if (currency === "USD") return "$";
  if (currency === "EUR") return "EUR ";
  return "INR ";
}

export function formatAmount(amount, currency = "INR") {
  const normalized = normalizeCurrency(currency);
  const value = Number(amount || 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: normalized,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencySymbol(normalized)}${value.toFixed(2)}`;
  }
}

export function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value) {
  return Number((Number(value || 0) + Number.EPSILON).toFixed(2));
}

export function memberNameKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCurrency(currency) {
  const value = String(currency || "INR").trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(value)) return value;
  if (/^[A-Z]{3}$/.test(value)) return value;
  return "INR";
}

export function normalizeReceiptDate(dateText) {
  if (!dateText) return "";

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateText)) {
    const [y, m, d] = dateText.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(dateText)) {
    const [d, m, y] = dateText.split(/[\/-]/);
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

export function uniqueMemberEntries(entries) {
  const seen = new Set();
  const result = [];

  for (const item of entries || []) {
    const name = String(item?.name || item || "").trim();
    const email = String(item?.email || "").trim();

    if (!name) continue;

    const key = memberNameKey(name);
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push({ name, email });
  }

  return result;
}

export function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}
