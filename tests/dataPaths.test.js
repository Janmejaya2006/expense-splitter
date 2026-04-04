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
