# DATABASE — TruffleTrade

## Backends

| Backend | Used when | File/Host |
|---|---|---|
| SQLite (better-sqlite3, WAL) | `DATABASE_URL` unset (subscriber desktop) | `data/truffletrade.sqlite3` (`SQLITE_PATH` overrides) |
| Postgres (Neon) | `DATABASE_URL` set (Vercel prod) | Neon connection string, sslmode=require |

Both store layers implement identical interfaces (`LicensingDb`, `PaperStore`);
routes never branch on backend. Schema is created idempotently at first
connection in `core/licensing/db.ts` and `core/paper/db.ts`.

## Tables (Postgres names; SQLite mirrors with INTEGER PKs)

Licensing/licensing-adjacent:
- `tt_orders` — order id (PK), charge_id (UNIQUE), status, timestamps, code_hash, code_plain (plaintext tied to one order for retrieval)
- `tt_codes` — code_hash (PK), order_id, status, activated/expires/last_seen, calls_total
- `tt_federation_updates` — ts, peer_hash, tokens, epoch, batch_json (hashed aggregates only)

Paper trading + audit:
- `tt_paper_accounts` — owner_code_hash (UNIQUE), cash_usd (CHECK >= 0), start_usd, peak_value_usd, assumptions_json
- `tt_paper_orders` — account_id FK, ticker, side/type (CHECK), quantity (CHECK > 0), limit_price, status (CHECK), reason
- `tt_paper_fills` — order_id FK, ticker, side, quantity (CHECK > 0), price_usd (CHECK > 0), fee/slippage/realized_pnl, ts
- `tt_paper_positions` — (account_id, ticker) PK, quantity (CHECK >= 0), avg_cost_usd (CHECK >= 0)
- `tt_audit_events` — ts, actor_hash, event, detail_json (append-only; no raw codes)

Indexes: orders by (account_id, created_ts DESC), fills by ts, federation/audit by ts DESC.

## Migration rules

- Additive only (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN` via new migrations).
- No manual production DDL. Any destructive change requires: written plan →
  test-DB application → integration tests → backup → apply → verify.
- CHECK constraints guard accounting invariants (cash >= 0, quantity > 0, price > 0).

## Reliability notes

- Queries on the shared pg Client are serialized (no overlapping `Promise.all`
  on one connection) — pg deprecation + correctness.
- JSONB columns are normalized on read (`jsonbText`) so SQLite/pg both parse.
- Transactionality: multi-write order flow is single-owner per account and
  serialized by the service layer; concurrent duplicate orders are prevented
  by the risk gate + per-code rate limits (true row-level locking is a documented follow-up).

## Backup / restore

- Neon: point-in-time restore via console (retention per plan). Restore drill UNVERIFIED.
- SQLite: file copy while app closed.

## Verified

- Schema creation on empty SQLite (tests/paper-store.test.ts, licensing-store.test.ts).
- CHECK constraint enforcement (negative quantity insert throws).
- Neon reachable from local + Vercel; health endpoint reports backend kind.
