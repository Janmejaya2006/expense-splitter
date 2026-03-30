import test from "node:test";
import assert from "node:assert/strict";
import { getConfigHealth } from "../lib/configHealth.js";

function withEnv(updates, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("getConfigHealth flags missing AUTH_SECRET as required failure", () => {
  const health = withEnv(
    {
      AUTH_SECRET: "any-long-random-string",
      APP_DB_BACKEND: "sqlite",
      RESEND_API_KEY: null,
      EMAIL_FROM: null,
    },
    () => getConfigHealth()
  );

  assert.equal(health.ok, false);
  assert.ok(health.checks.some((item) => item.key === "auth_secret" && item.status === "fail"));
});

test("getConfigHealth passes required checks with valid auth + db config", () => {
  const health = withEnv(
    {
      AUTH_SECRET: "this-is-a-long-secret-string-for-tests-12345",
      APP_DB_BACKEND: "sqlite",
      RESEND_API_KEY: null,
      EMAIL_FROM: null,
      TWILIO_ACCOUNT_SID: null,
      TWILIO_AUTH_TOKEN: null,
      TWILIO_FROM_PHONE: null,
      TWILIO_WHATSAPP_FROM: null,
    },
    () => getConfigHealth()
  );

  assert.equal(health.ok, true);
  assert.ok(health.score >= 0);
  assert.ok(health.checks.some((item) => item.key === "database_backend" && item.status === "ok"));
});
