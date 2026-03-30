# Expense Split + OCR + AI Planner

Full-stack Next.js app for group expense tracking, settlement workflows, invite-based collaboration, OCR receipt parsing, and AI-assisted planning.

## Highlights

- Auth (register/login/logout + password reset)
- Mandatory email verification flow before first login
- Email OTP verification during login (2FA)
- Group isolation by user access (owner/admin/member)
- Group invites with one-click acceptance links
- Expense split modes: equal / percent / shares
- Settlement suggestions + payment history
- Notification delivery (email / SMS / WhatsApp)
- Notification retry queue + webhook delivery status sync
- Receipt OCR Studio (image + text parsing)
- AI planner that imports members + expenses from natural language
- Smart expense category auto-detection (`Auto` mode while adding/editing)
- Config health endpoint for setup diagnostics
- File-based payment proof storage (no new base64 blobs in DB)
- File-based expense proof storage (bill/photo attachments on expenses)
- UPI QR codes for INR settlement suggestions
- Recurring monthly expenses with maintenance auto-generation
- Spending charts (bar + pie), member leaderboard, and activity feed
- Expense comments for clarification
- Monthly summary email dispatch during maintenance runs
- Browser Web Push notifications (service worker + VAPID)
- Multi-currency expense input with auto-conversion to group currency
- PWA installability + offline fallback support
- Background maintenance endpoint for invite expiry + queue processing
- API abuse protection with rate limiting and secure middleware controls

## Stack

- Next.js App Router + React (client dashboard)
- API route handlers
- SQLite state storage (`data/app.sqlite`) with JSON fallback
- Local proof file storage (`data/proofs`)

## Project Scripts

```bash
npm run dev
npm run lint
npm test
npm run build
```

## Environment

Create `.env.local`:

```bash
# Required
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_2FA_ENABLED=true
AUTH_REQUIRE_EMAIL_VERIFICATION=true

# Optional DB toggle: sqlite (default), json, postgres (scaffold only)
APP_DB_BACKEND=sqlite

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
EMAIL_FROM="Expense Split <noreply@your-domain.com>"

# SMS / WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_PHONE=+1xxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Optional webhook + job runner secrets
NOTIFICATION_WEBHOOK_SECRET=your-webhook-secret
JOB_RUNNER_SECRET=your-maintenance-secret

# Optional: register service worker in dev too
NEXT_PUBLIC_ENABLE_PWA_DEV=false

# Optional Web Push (VAPID)
WEB_PUSH_VAPID_PUBLIC_KEY=...
WEB_PUSH_VAPID_PRIVATE_KEY=...
WEB_PUSH_VAPID_SUBJECT=mailto:noreply@your-domain.com
```

## Security Notes

- Never commit `.env.local` or any real keys. Rotate any key that was ever exposed.
- `AUTH_SECRET` must be a long random secret (32+ chars); production requires it.
- Keep the database on private network access only (localhost/VPC). Never expose DB ports publicly.
- API routes are protected by auth + per-resource ownership checks to prevent IDOR.
- Global API middleware enforces HTTPS in production and applies rate limits.
- Password reset and email verification tokens are hashed at rest and expire automatically.
- In production, configure `JOB_RUNNER_SECRET` and `NOTIFICATION_WEBHOOK_SECRET`; those endpoints reject unauthenticated secret-less access.
- Monitor logs for `auth.*`, `security.rate_limit_blocked`, and `security.https_required_blocked` events to detect abuse.

## Operational Endpoints

- `GET /api/health/config`  
  Returns config readiness summary.
- `POST /api/jobs/maintenance`  
  Runs invite-expiry cleanup, recurring-expense generation, monthly summary emails, and queued notification processing.
- `POST /api/notifications/webhook`  
  Syncs provider delivery status into notification history.
- `GET /api/push/public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`  
  Handles browser push subscription lifecycle for logged-in users.

## Testing and CI

- Tests are in `/tests` and run with Node test runner.
- GitHub Actions workflow: [`.github/workflows/ci.yml`](/Users/janmejayabiswal/untitled%20folder/expense-split-ocr/.github/workflows/ci.yml)
  - `npm ci`
  - `npm run lint`
  - `npm test`
  - `npm run build`

## Database Upgrade Path

Postgres migration scaffold is included:

- [Migration README](/Users/janmejayabiswal/untitled%20folder/expense-split-ocr/db/migrations/README.md)
- [Postgres Init SQL](/Users/janmejayabiswal/untitled%20folder/expense-split-ocr/db/migrations/postgres/001_init.sql)
