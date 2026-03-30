import webpush from "web-push";

let configured = false;

function asString(value) {
  return String(value || "").trim();
}

function getConfig() {
  return {
    publicKey: asString(process.env.WEB_PUSH_VAPID_PUBLIC_KEY),
    privateKey: asString(process.env.WEB_PUSH_VAPID_PRIVATE_KEY),
    subject: asString(process.env.WEB_PUSH_VAPID_SUBJECT) || "mailto:noreply@example.com",
  };
}

function ensureConfigured() {
  if (configured) return true;
  const config = getConfig();
  if (!config.publicKey || !config.privateKey) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  configured = true;
  return true;
}

export function hasWebPushConfig() {
  const config = getConfig();
  return Boolean(config.publicKey && config.privateKey);
}

export function getWebPushPublicKey() {
  return getConfig().publicKey;
}

export function normalizePushSubscription(input) {
  const source = input && typeof input === "object" ? input : {};
  const endpoint = asString(source.endpoint);
  const keys = source.keys && typeof source.keys === "object" ? source.keys : {};
  const p256dh = asString(keys.p256dh);
  const auth = asString(keys.auth);

  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    keys: { p256dh, auth },
  };
}

export async function sendWebPushBatch(subscriptions, payload) {
  if (!ensureConfigured()) {
    return {
      sent: 0,
      failed: 0,
      expiredEndpoints: [],
      failures: [],
    };
  }

  const payloadText = JSON.stringify(payload || {});
  let sent = 0;
  let failed = 0;
  const expiredEndpoints = [];
  const failures = [];

  for (const item of subscriptions || []) {
    const subscription = normalizePushSubscription(item);
    if (!subscription) continue;

    try {
      await webpush.sendNotification(subscription, payloadText, {
        TTL: 60,
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      const statusCode = Number(error?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        expiredEndpoints.push(subscription.endpoint);
      }
      failures.push({
        endpoint: subscription.endpoint,
        statusCode: statusCode || null,
        message: error instanceof Error ? error.message : "Push failed",
      });
    }
  }

  return {
    sent,
    failed,
    expiredEndpoints,
    failures,
  };
}

