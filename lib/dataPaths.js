import path from "node:path";

function resolveFromCwd(value, fallbackPath) {
  const raw = String(value || "").trim();
  if (!raw) return path.resolve(/* turbopackIgnore: true */ process.cwd(), fallbackPath);
  return path.isAbsolute(raw) ? raw : path.resolve(/* turbopackIgnore: true */ process.cwd(), raw);
}

export const DATA_DIR = resolveFromCwd(process.env.APP_DATA_DIR, "data");
export const DB_JSON_PATH = resolveFromCwd(process.env.APP_DB_JSON_PATH, path.join(DATA_DIR, "db.json"));
export const DB_SQLITE_PATH = resolveFromCwd(process.env.APP_DB_SQLITE_PATH, path.join(DATA_DIR, "app.sqlite"));
export const PROOF_ROOT = resolveFromCwd(process.env.PROOF_ROOT, path.join(DATA_DIR, "proofs"));

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
