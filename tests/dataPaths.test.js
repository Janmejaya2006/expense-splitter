import test from "node:test";
import assert from "node:assert/strict";

test("data path helpers honor APP_DATA_DIR override", async () => {
  const previous = process.env.APP_DATA_DIR;
  process.env.APP_DATA_DIR = ".tmp/test-data-root";

  try {
    const dataPathsModule = await import(`../lib/dataPaths.js?ts=${Date.now()}`);
    assert.match(dataPathsModule.DATA_DIR, /\.tmp\/test-data-root$/);
    assert.match(dataPathsModule.DB_JSON_PATH, /\.tmp\/test-data-root\/db\.json$/);
    assert.match(dataPathsModule.PROOF_ROOT, /\.tmp\/test-data-root\/proofs$/);
  } finally {
    if (previous === undefined) {
      delete process.env.APP_DATA_DIR;
    } else {
      process.env.APP_DATA_DIR = previous;
    }
  }
});

test("data paths default to /tmp on Vercel when APP_DATA_DIR is not set", async () => {
  const previousAppDataDir = process.env.APP_DATA_DIR;
  const previousVercel = process.env.VERCEL;
  delete process.env.APP_DATA_DIR;
  process.env.VERCEL = "1";

  try {
    const dataPathsModule = await import(`../lib/dataPaths.js?ts=${Date.now()}`);
    assert.equal(dataPathsModule.DATA_DIR, "/tmp/expense-split-data");
    assert.equal(dataPathsModule.DB_JSON_PATH, "/tmp/expense-split-data/db.json");
    assert.equal(dataPathsModule.DB_SQLITE_PATH, "/tmp/expense-split-data/app.sqlite");
  } finally {
    if (previousAppDataDir === undefined) {
      delete process.env.APP_DATA_DIR;
    } else {
      process.env.APP_DATA_DIR = previousAppDataDir;
    }

    if (previousVercel === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previousVercel;
    }
  }
});
