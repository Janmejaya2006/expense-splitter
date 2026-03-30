const FX_TIMEOUT_MS = 8000;
const FX_CACHE_TTL_MS = 1000 * 60 * 30;

const rateCache = new Map();

function round(value, precision = 6) {
  const digits = Math.max(0, Number(precision || 0));
  return Number((Number(value || 0) + Number.EPSILON).toFixed(digits));
}

function nowIso() {
  return new Date().toISOString();
}

export function normalizeCurrencyCode(currency, fallback = "INR") {
  const fallbackCode = String(fallback || "INR").trim().toUpperCase();
  const value = String(currency || fallbackCode).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(value) ? value : fallbackCode;
}

async function fetchJsonWithTimeout(url, timeoutMs = FX_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFromFrankfurter(fromCurrency, toCurrency) {
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}`;
  const body = await fetchJsonWithTimeout(url);
  const rate = Number(body?.rates?.[toCurrency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Rate missing from frankfurter");
  }
  return {
    rate: round(rate, 8),
    provider: "frankfurter",
    fetchedAt: nowIso(),
  };
}

async function fetchFromOpenErApi(fromCurrency, toCurrency) {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(fromCurrency)}`;
  const body = await fetchJsonWithTimeout(url);
  if (String(body?.result || "").toLowerCase() !== "success") {
    throw new Error("open.er-api returned non-success result");
  }
  const rate = Number(body?.rates?.[toCurrency]);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Rate missing from open.er-api");
  }
  return {
    rate: round(rate, 8),
    provider: "open.er-api",
    fetchedAt: nowIso(),
  };
}

const PROVIDERS = [fetchFromFrankfurter, fetchFromOpenErApi];

export async function getExchangeRate(fromCurrency, toCurrency) {
  const from = normalizeCurrencyCode(fromCurrency, "INR");
  const to = normalizeCurrencyCode(toCurrency, "INR");

  if (from === to) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      provider: "identity",
      fetchedAt: nowIso(),
    };
  }

  const cacheKey = `${from}->${to}`;
  const cached = rateCache.get(cacheKey);
  if (cached && Number(cached.expiresAt || 0) > Date.now()) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: Number(cached.rate),
      provider: String(cached.provider || "cache"),
      fetchedAt: String(cached.fetchedAt || nowIso()),
      cached: true,
    };
  }

  const errors = [];
  for (const provider of PROVIDERS) {
    try {
      const result = await provider(from, to);
      rateCache.set(cacheKey, {
        rate: result.rate,
        provider: result.provider,
        fetchedAt: result.fetchedAt,
        expiresAt: Date.now() + FX_CACHE_TTL_MS,
      });
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: Number(result.rate),
        provider: String(result.provider),
        fetchedAt: String(result.fetchedAt),
        cached: false,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown provider error");
    }
  }

  if (cached) {
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: Number(cached.rate),
      provider: `${String(cached.provider || "cache")} (stale-cache)`,
      fetchedAt: String(cached.fetchedAt || nowIso()),
      cached: true,
      stale: true,
    };
  }

  throw new Error(
    `Unable to fetch exchange rate ${from}->${to}${
      errors.length ? ` (${errors.join(" | ")})` : ""
    }`
  );
}

export async function convertAmountToCurrency(amount, fromCurrency, toCurrency) {
  const sourceAmount = round(Number(amount || 0), 2);
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error("Amount must be positive");
  }

  const from = normalizeCurrencyCode(fromCurrency, "INR");
  const to = normalizeCurrencyCode(toCurrency, "INR");

  if (from === to) {
    return {
      sourceAmount,
      sourceCurrency: from,
      convertedAmount: sourceAmount,
      targetCurrency: to,
      rate: 1,
      provider: "identity",
      fetchedAt: nowIso(),
      cached: true,
    };
  }

  const rateInfo = await getExchangeRate(from, to);
  return {
    sourceAmount,
    sourceCurrency: from,
    convertedAmount: round(sourceAmount * Number(rateInfo.rate || 0), 2),
    targetCurrency: to,
    rate: round(Number(rateInfo.rate || 0), 8),
    provider: rateInfo.provider,
    fetchedAt: rateInfo.fetchedAt,
    cached: Boolean(rateInfo.cached),
    stale: Boolean(rateInfo.stale),
  };
}
