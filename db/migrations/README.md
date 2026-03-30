# Database Upgrade Scaffold

This project currently runs on a single persisted state blob (`sqlite` by default, `json` fallback).  
This folder prepares the path to move into relational storage for scale and safer concurrency.

## Included

- `postgres/001_init.sql`: base relational schema for groups, members, expenses, notifications, invites, users.

## Suggested rollout

1. Keep current app running on `APP_DB_BACKEND=sqlite`.
2. Provision Postgres (local Docker or managed service).
3. Apply `postgres/001_init.sql` to create tables.
4. Build one-time ETL: read current state via `lib/store.js` and insert into Postgres tables.
5. Add a new `postgres` adapter in `lib/store.js` (feature-flagged).
6. Dual-run reads in staging, then cut writes to Postgres.
7. Keep fallback export snapshots during the first production week.

## Notes

- IDs are mapped as `BIGINT` to preserve existing numeric IDs.
- `JSONB` columns keep flexible fields for split configs and provider payloads.
- Queue tables are included to support retry-safe notification delivery.
