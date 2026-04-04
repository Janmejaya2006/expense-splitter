import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const API_GROUPS_ROOT = path.join(process.cwd(), "app", "api", "groups");

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolute)));
      continue;
    }
    if (entry.isFile() && entry.name === "route.js") {
      files.push(absolute);
    }
  }
  return files;
}

test("group API routes require auth and enforce group ownership checks", async () => {
  const files = await walk(API_GROUPS_ROOT);
  assert.ok(files.length > 0, "Expected at least one groups API route");

  const guardTokens = [
    "canAccessGroup(",
    "hasGroupPermission(",
    "groupPermissionsForUser(",
    "scopeDbForUser(",
  ];

  for (const filePath of files) {
    const source = await fs.readFile(filePath, "utf8");
    const rel = path.relative(process.cwd(), filePath);
    assert.ok(source.includes("requireAuth("), `${rel} must call requireAuth()`);

    const isGroupIdRoute = rel.includes(`${path.sep}[id]${path.sep}`);
    if (isGroupIdRoute) {
      const hasGuard = guardTokens.some((token) => source.includes(token));
      assert.ok(hasGuard, `${rel} must enforce group-level authorization checks`);
    }
  }
});
