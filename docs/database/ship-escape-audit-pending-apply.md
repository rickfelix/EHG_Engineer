---
Category: Database
Status: Approved
Version: 1.0.0
Author: Golf-2 (Sonnet seat, SD-LEO-INFRA-SHIP-WITNESS-TRIO-001)
Last Updated: 2026-07-11
Tags: [migration, chairman-gated, ship-escape-audit, pending-apply]
---

# ship_escape_audit — committed, awaiting chairman-gated apply

**Migration**: `database/migrations/20260711_ship_escape_audit.sql`
**State**: COMMITTED-NOT-DEPLOYED **by design** — creating a new table is gated DDL
(`requires-chairman-apply`, marked in the migration header). Code that writes/reads this table
(`lib/ship/escape-auth.mjs`, wired into `lib/ship/auto-merge.mjs`'s `observeMergeWorkLadder()`)
already degrades gracefully when it is absent: `writeEscapeAuditRow()` failures are caught
non-fatally (never block a merge), and `evaluateP4ProtectionIntegrity()`'s `escapeAuth` sub-field
simply reports `not_evaluable` until the checker can run against a real table.

## Apply (chairman-stamped)

```bash
node scripts/apply-migration.js database/migrations/20260711_ship_escape_audit.sql --prod-deploy
# with the chairman @approved-by stamp per standing policy
```

## Post-apply verification (30-second smoke)

1. `select count(*) from ship_escape_audit;` returns `0` (table exists, empty).
2. Trigger an admin-override merge (branch protection `enforce_admins=true`, e.g. via `/ship` on a
   platform repo) and confirm exactly one row lands with both `pr_number`+`repo` AND `session_id`
   populated (the dual-key invariant — neither is nullable).
3. `npx vitest run tests/unit/ship/escape-auth.test.js tests/unit/ship/merge-witness-ladder.test.js` stays green.

## Rollback

```sql
DROP TABLE IF EXISTS public.ship_escape_audit;
```

## Contract notes

Dual-key by design: `pr_number`+`repo` (merge identity) AND `session_id` (actor identity) are both
`NOT NULL` — `writeEscapeAuditRow()` throws before attempting an insert if either half is missing,
so no half-identified audit row can ever be written. RLS enabled, `service_role`-only policy (this
is an internal harness audit trail, not user-facing data). Consulted only for the admin-override
case (`adminOverride=true`) — ordinary branch-protection detection (P4's base check) is completely
unaffected and continues to work via the existing `checkProtection` wiring. Not yet wired into
`evaluateEnforcementDecision()`'s pass/fail computation (that module explicitly documents this as
deferred to a future SD, once wiring P4 into the real enforce-flip decision is scoped) — this
migration + the reader/writer code build the substrate only, per retro `98e6619a` item #1.
