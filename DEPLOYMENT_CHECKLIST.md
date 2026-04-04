# Deployment Checklist

Use this checklist before each production release.

## 1) Secrets and Env
- Set all secrets in your deployment platform secret manager (never in git):
  - `AUTH_SECRET` (32+ chars)
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - Gmail SMTP credentials: `GMAIL_USER`, `GMAIL_APP_PASSWORD`
  - Payment provider secrets (`RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY`, `PAYPAL_CLIENT_SECRET`)
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `JOB_RUNNER_SECRET`, `NOTIFICATION_WEBHOOK_SECRET`
- Keep `.env.local` local-only.
- Run `npm run security:scan` before merge.

## 2) Transport Security
- Enforce HTTPS at edge/load balancer.
- Keep HSTS enabled.
- Ensure cookies are secure in production (`secure: true`).

## 3) Database and Storage
- Do not expose database ports publicly.
- Allow DB access only from app/runtime network.
- Back up DB on a schedule and verify restore steps monthly.
- Restrict proof storage path permissions.

## 4) Auth and Abuse Protection
- Keep email verification enabled in production.
- Keep OTP/2FA login enabled in production.
- Keep API rate limiting enabled.
- Monitor repeated login failures and unusual request bursts.

## 5) Observability
- Capture structured logs from app runtime.
- Monitor auth events, 4xx/5xx spikes, and notification/payment errors.
- Alert on repeated failures of:
  - `/api/auth/*`
  - `/api/payments/*`
  - `/api/notifications/*`

## 6) Release Gates
- Required checks:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run security:scan`
- Deploy from reviewed PRs only.

## 7) Rollback Plan
- Keep previous deploy artifact/version available.
- If severe issue:
  1. Roll back to previous stable version.
  2. Rotate potentially impacted secrets.
  3. Review logs for root cause.
  4. Re-release with a hotfix and postmortem notes.
