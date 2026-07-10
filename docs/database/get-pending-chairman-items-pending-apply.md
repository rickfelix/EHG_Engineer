---
Category: Database
Status: Approved
Version: 1.0.0
Author: Alpha-3 (Fable seat, SD-EHG-CONSOLE-PENDING-ITEMS-RPC-001)
Last Updated: 2026-07-10
Tags: [migration, chairman-gated, rpc, pending-apply]
---

# get_pending_chairman_items — committed, awaiting chairman-gated apply

**Migration**: `database/migrations/20260710_create_get_pending_chairman_items.sql` (merged, PR #5849)
**State**: COMMITTED-NOT-DEPLOYED **by design** — `CREATE FUNCTION` on the live DB is gated DDL
(`requires_chairman_apply`, pre-flagged at sourcing). The console's migration-apply-state System
Alert will list this migration as a committed-not-deployed gap until the apply lands; that is the
expected state, not a failure.

## Apply (chairman-stamped)

```bash
node scripts/apply-migration.js database/migrations/20260710_create_get_pending_chairman_items.sql --prod-deploy
# with the chairman @approved-by stamp per standing policy
```

## Post-apply verification (30-second smoke)

1. `/chairman` and `/chairman/decisions` (authenticated): the `rpc/get_pending_chairman_items`
   POST returns **200** — the per-page-load PGRST202 404 console error disappears.
2. Queue rows are predicate-clean: no `flag_review`/`flag_enablement` telemetry, no fixture
   ventures; `deadline`/`summary` populated on items (fixes the blanket "No SLA" artifact class).
3. Contract test stays green (idempotent post-apply): 
   `npx vitest run tests/integration/get-pending-chairman-items.contract.test.js`

## Rollback

```sql
DROP FUNCTION IF EXISTS public.get_pending_chairman_items(text, integer, integer);
```
Consumers transparently resume the raw-view fallback (`useDecisionGateQueue.ts:77`).

## Contract notes

The function is the **canonical chairman-actionable predicate home** shared with
SD-EHG-CONSOLE-QUEUE-POLLUTION-001 and SD-EHG-CONSOLE-PENDING-COUNT-SSOT-001 — the predicate is
defined once, in the migration's comment block; siblings consume it via the RPC (`total` for
count gauges). Envelope: `{items, total, page, page_size}`; SECURITY INVOKER; EXECUTE granted to
`authenticated`/`service_role` only (PUBLIC revoked). Provenance: console assessment ledger
finding #10 (PR #5828); measured motivation: 77 pending rows = 75 machine telemetry + 2 real.
