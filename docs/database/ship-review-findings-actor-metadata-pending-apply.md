---
Category: Database
Status: Approved
Version: 1.0.0
Author: Golf-2 (Sonnet seat, SD-LEO-INFRA-SHIP-WITNESS-TRIO-001)
Last Updated: 2026-07-11
Tags: [migration, chairman-gated, ship-review-findings, pending-apply]
---

# ship_review_findings.metadata — committed, awaiting chairman-gated apply

**Migration**: `database/migrations/20260711_ship_review_findings_actor_metadata.sql`
**State**: COMMITTED-NOT-DEPLOYED **by design** — adding a column to `ship_review_findings` on the
live DB is gated DDL (`requires-chairman-apply`, marked in the migration header). Code that
consults this column (`lib/ship/merge-witness-ladder.mjs`'s `evaluateP2Witness()`) already
degrades gracefully when it is absent — the `actorSeparation` sub-field simply reports
`not_evaluable`, matching today's behavior exactly. Nothing regresses while this sits unapplied.

## Apply (chairman-stamped)

```bash
node scripts/apply-migration.js database/migrations/20260711_ship_review_findings_actor_metadata.sql --prod-deploy
# with the chairman @approved-by stamp per standing policy
```

## Post-apply verification (30-second smoke)

1. `select column_name from information_schema.columns where table_name='ship_review_findings' and column_name='metadata';` returns one row.
2. `npx vitest run tests/unit/ship/merge-witness-ladder.test.js` stays green (all pre-existing +
   the new actorSeparation tests).
3. Seed a `ship_review_findings` row with `metadata = {"actor_type":"agent","actor_role":"EXEC"}`
   and confirm `evaluateP2Witness()` against it returns `actorSeparation.status='pass'`.

## Rollback

```sql
ALTER TABLE public.ship_review_findings DROP COLUMN IF EXISTS metadata;
```

## Contract notes

Additive-only (`ADD COLUMN IF NOT EXISTS`), nullable, no CHECK constraint (keeps the shape
forward-compatible). Reuses the `system_events` attribution vocabulary (`actor_type`/`actor_role`/
`agent_id`) rather than inventing a new one. No writer populates this column yet — this migration
builds the read-side substrate (per retro `b119bba1` item #2); a future SD wires an actual writer
once the "who is the actor" capture design at review-gate time is scoped.
