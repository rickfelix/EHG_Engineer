# MarketLens Owned-Audience Content Loop

**SD**: SD-LEO-FEAT-MARKETLENS-OWNED-AUDIENCE-001
**Status**: Approved
**Version**: 1.0.0
**Author**: EXEC
**Last Updated**: 2026-07-04
**Tags**: marketing, marketlens, agent-operated, standing-caps

Backend engine (`lib/marketing/*`, no UI, `target_application=EHG_Engineer`) for MarketLens's
agent-operated, organic-only owned-audience channel, per chairman decision `08547ee8`
(2026-07-03): venture-owned channel accounts + content, **zero paid spend**, under the
standing MarketLens caps (2M tokens / 100k writes / 2 instances).

## Loop

```
provision (organic-only) -> generate + queue (review-gate) -> approve -> publish -> measure
```

| Step | Module | Table(s) |
|------|--------|----------|
| Provision | `lib/marketing/organic-channel-provisioning.js` | `venture_distribution_channels`, `channel_budgets` |
| Generate + queue | `lib/marketing/owned-audience-content-loop.js` (`generateAndQueue`) | `marketing_content_queue` |
| Publish (approved only) | `lib/marketing/owned-audience-content-loop.js` (`publishApprovedItem`) | `factory_guardrail_state`, `distribution_history` |
| Measure | `lib/marketing/owned-audience-content-loop.js` (`computeWeeklyRollup`) | `venture_audience_weekly` |
| Caps | `lib/marketing/marketlens-caps.js` | `venture_write_ledger`, `factory_guardrail_state.active_content_loop_instances` |

## Organic-only enforcement

The live `distribution_channel_config` artifact (`venture_artifacts.artifact_type =
'distribution_channel_config'`) is a Stage-22 planning artifact whose `artifact_data.channels`
is an **array** of `{channel, status, ad_copy, targeting}` objects — it may list a paid channel
(`google_ads`) as active. `selectOrganicChannel()` hard-excludes anything not in the organic
allowlist (`blog_seo`, `twitter_x`, `email`, `facebook_instagram`), regardless of the source
artifact's status flags. `venture_distribution_channels.budget_usd` carries a schema-level
`CHECK (budget_usd = 0)` as the primary zero-spend gate; a `channel_budgets` row seeded at
`monthly_budget_cents=0` is a secondary, belt-and-suspenders gate using `publisher/index.js`'s
own existing budget-check mechanism.

## Review-gate SSOT

`marketing_content_queue` (not `marketing_content`/`marketing_content_variants`) is the sole
authority for this loop's review state (`pending_review` -> `approved`/`rejected` ->
`posted`). `content-generator.js`'s `buildGenerationPrompt`/`callLLMForVariants` helpers are
reused directly (exported for this purpose); `generateContent()` itself is not called, since it
writes to the other table.

## Standing caps

- **Tokens (2M)**: enforced via the existing `get_venture_token_budget_status` RPC, which
  derives its limit from `budget_profile` on the latest `venture_token_ledger` row — every
  `recordTokenUsage` call for this loop passes `metadata.budgetProfile = 'deep_due_diligence'`
  (the profile string that resolves to a 2,000,000-token limit). No separate seeded budget row
  is required for this path.
- **Writes (100k)**: new `venture_write_ledger` table + `get_venture_write_budget_status` RPC,
  mirroring the token-tracker pattern. Recorded on every queue-insert/publish/measurement-write.
- **Instances (2 concurrent)**: `factory_guardrail_state.active_content_loop_instances`,
  guarded by atomic `acquire_content_loop_instance_slot`/`release_content_loop_instance_slot`
  RPCs (single `UPDATE ... WHERE` statement — race-safe without a read-then-write round trip).

All three cap checks **fail closed**: an RPC/lookup error blocks the operation rather than
allowing it through.

## Kill-switch

`factory_guardrail_state.kill_switch_active` (already wired for MarketLens by the Software
Factory guardrail system) is checked before every publish. If active, the publish aborts and
the queue item's `approved` status is preserved (not consumed) for retry once cleared.

## Weekly measurement

`venture_audience_weekly` is a **durable snapshot** (one row per `(venture_id, week_start)`),
computed once from `distribution_history` and never recomputed for a past week — a later
backfill correction to `distribution_history` must not silently move an already-reported
T+4-week demand-evidence number.

## Deferred follow-ups

- **EHG cockpit review-queue UI**: no approval UI exists yet for `marketing_content_queue`.
  The `ehg/src/components/chairman-v3/decisions/*` pattern (`DecisionQueueView.tsx`,
  `DecisionGateDetailSheet.tsx`, `DecisionActions.tsx`) is the recommended template — lives in
  the EHG app, not EHG_Engineer, so it is a separate follow-up SD.
- **`distribution_history` RLS drift**: live policies are `service_role`-only, more
  restrictive than the original migration's intended authenticated `dh_venture_access` policy.
  Blocks future authenticated dashboard reads; does not affect this loop's service_role reads.

## Migrations

- `database/migrations/20260704_marketlens_owned_audience_caps.sql`
- `database/migrations/20260704b_marketlens_instance_slot_rpcs.sql`
- `database/migrations/20260704c_marketlens_organic_channel_seed.sql`
