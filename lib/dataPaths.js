import path from "node:path";

const VERCEL_EPHEMERAL_DATA_DIR = "/tmp/expense-split-data";

function resolveFromCwd(value, fallbackPath) {
  const raw = String(value || "").trim();
  if (!raw) return path.resolve(/* turbopackIgnore: true */ process.cwd(), fallbackPath);
  return path.isAbsolute(raw) ? raw : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}

function defaultDataDir() {
  const runningOnVercel = String(process.env.VERCEL || "").trim();
  if (runningOnVercel) return VERCEL_EPHEMERAL_DATA_DIR;
  return "data";
}

export const DATA_DIR = resolveFromCwd(process.env.APP_DATA_DIR, defaultDataDir());
export const DB_JSON_PATH = resolveFromCwd(process.env.APP_DB_JSON_PATH, path.join(DATA_DIR, "db.json"));
export const DB_SQLITE_PATH = resolveFromCwd(process.env.APP_DB_SQLITE_PATH, path.join(DATA_DIR, "app.sqlite"));
export const PROOF_ROOT = resolveFromCwd(process.env.PROOF_ROOT, path.join(DATA_DIR, "proofs"));
export const BUNDLED_DATA_DIR = path.resolve(/* turbopackIgnore: true */ process.cwd(), "data");
export const BUNDLED_DB_JSON_PATH = path.join(BUNDLED_DATA_DIR, "db.json");

export function relativeToDataDir(absolutePath) {
  return path.relative(DATA_DIR, absolutePath).replaceAll(path.sep, "/");
}

export function resolveInsideDataDir(relativePath) {
  const safeRelative = String(relativePath || "").trim();
  if (!safeRelative) return null;

  const absolutePath = path.resolve(/* turbopackIgnore: true */ DATA_DIR, safeRelative);
  const normalizedDataDir = path.resolve(DATA_DIR);
  if (!absolutePath.startsWith(normalizedDataDir)) {
    return null;
  }

  return absolutePath;
}
