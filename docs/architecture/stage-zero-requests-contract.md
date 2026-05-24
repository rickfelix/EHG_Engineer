# `stage_zero_requests` — Cross-Repo Intake Contract

**Status:** Active · **SD:** SD-LEO-INFRA-STAGE-OPPORTUNITY-INTAKE-001 (FR-005, gap G5)
**Authoritative architecture:** [ADR-STAGE0-INTAKE-001](../adr/ADR-STAGE0-INTAKE-001.md)

`stage_zero_requests` is the canonical intake queue and the **single cross-repo handshake** for
the Stage 0 venture-intake spine. It is written by the `ehg` UI (producer) and drained by the
`EHG_Engineer` queue processor (consumer). Documenting it makes each half visible to the other.

```
ehg UI (producer)                         EHG_Engineer (consumer)
useRequestStageZero  ──insert(pending)──▶  stage_zero_requests  ◀──poll/claim── stage-zero-queue-processor.js
                                                  │                                      │
                                                  └──────── executeStageZero ────────────┘
                                                            → venture_briefs → ventures @ stage 1
```

## Producer — `ehg/src/hooks/useStageZeroQueue.ts` (`useRequestStageZero`)

Inserts one row per intake request as the authenticated chairman user:

| Column | Written by producer | Notes |
|---|---|---|
| `requested_by` | `auth.user.id` | required |
| `status` | `'pending'` | always the producer's starting state |
| `metadata` | `{ path, ... }` (jsonb) | `path` is the discriminator (see below) |
| `prompt` | text | NL idea (`own_idea`) or a human-readable summary |
| `blueprint_id` | uuid | **only** for `blueprint_browse` |

### `metadata.path` — the four canonical entry paths

| `path` | Extra `metadata` | `prompt` | Source UI |
|---|---|---|---|
| `discovery_mode` | `strategy`, `candidateCount`, optional `prompt_version_hint` | `Discovery: <strategy>` | DiscoveryModeDialog |
| `competitor_teardown` | `urls: string[]` | `Analyze competitors: …` | CompetitorTeardownDialog |
| `blueprint_browse` | — (uses `blueprint_id` column) | — | ExploreOpportunities / OpportunityBrowseTab |
| `own_idea` | — | the idea text | DiscoveryModeDialog "I Have an Idea" |

These are the **only** sanctioned UI intake paths. A direct `ventures` insert from the browser is
blocked by `trg_enforce_stage0_origin` (service_role / sanctioned bypass only).

## Consumer — `EHG_Engineer/scripts/stage-zero-queue-processor.js`

- **Poll** `fetchNextPending`: `status='pending'` ordered by `priority` desc, `created_at` asc.
- **Claim**: sets `claimed_by_session`, `claimed_at`, and a claimed/in-progress status.
- **Process** `executeStageZero` (path-router → 10-component synthesis → modeling → chairman-review)
  → `venture_briefs` → `persistVentureBrief` (on `decision='ready'`) → `ventures` @ `current_lifecycle_stage=1`.
- **Terminal write**: `status='completed'` + `result` on success, or `status='failed'` +
  `error_message`/`error_details` on failure.
- **Stale recovery** `releaseStaleClaims`: resets `claimed`/`in_progress` rows older than
  `STALE_CLAIM_MIN` (default 30 min) back to `pending`.

### Status lifecycle

```
pending ──claim──▶ claimed/in_progress ──┬──success──▶ completed
                                         └──error────▶ failed
   ▲                                         │
   └────────── releaseStaleClaims ───────────┘   (stale claimed/in_progress → pending)
dismissed  ← user dismiss (useDismissDiscovery)
```

### Idempotency (SD-LEO-INFRA-STAGE-OPPORTUNITY-INTAKE-001, F4)

A stale-claim re-execution can re-run a request whose venture was already created (when the
original run was interrupted before its `completed` status-write landed). The re-run's venture
insert trips the partial unique index `idx_ventures_unique_active_name` (SQLSTATE `23505`).
`persistVentureBrief` (`lib/eva/stage-zero/chairman-review.js`) now **catches 23505 and returns
the existing active venture** instead of throwing, so a genuinely-successful request is not left
`failed`. A genuine synthesis failure still throws upstream (before the insert) and is recorded
`failed` with no orphan venture.

> **Known follow-on (systemic, deferred):** the robust fix is a durable
> `venture_briefs.stage_zero_request_id` FK plus a request-id idempotency short-circuit in
> `checkForDuplicate` and a reconcile step in `releaseStaleClaims` (so a stale row whose venture
> already exists is marked `completed` rather than re-queued). Name-based correlation is fragile
> because ventures can be renamed after creation. Tracked for a follow-up SD.
