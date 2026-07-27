---
category: documentation
status: approved
version: 1.1.0
author: Rick Felix
last_updated: 2026-07-10
tags: [documentation]
---

# Harness Backlog — DEPRECATED

**As of 2026-04-29, harness-bug capture moved from this file to the `feedback` table** (`category='harness_backlog'`).

Why: file-based capture violated CLAUDE.md's database-first rule — the index couldn't be queried by `/leo next`, sub-agents, gates, or the clockwork-auto-triage workflow. The 36 historical entries from this file have been migrated to `feedback` rows (one-time migration via `scripts/one-off/migrate-harness-backlog-to-feedback.mjs`, idempotent via SHA-256 `metadata.dedup_hash`).

## How to log a new harness bug (replacement for the old one-line append)

```bash
node scripts/log-harness-bug.js "<symptom>" [--file <path>] [--sd <sd-key>] [--severity high|medium|low]
```

The CLI is idempotent (SHA-256 hash over `date::symptom::file`), so re-running on the same day with the same args is a no-op.

## How to query the backlog

```sql
-- All harness backlog rows
SELECT id, title, severity, metadata->>'deferred_from_sd_key' AS sd, metadata->>'source_location' AS file, status, created_at
  FROM feedback
 WHERE category = 'harness_backlog'
 ORDER BY created_at DESC;

-- Open / un-triaged only
SELECT * FROM feedback
 WHERE category = 'harness_backlog' AND status = 'new'
 ORDER BY created_at DESC;
```

## Triage flow (campaign mode)

When you next run a `[MODE: campaign]` session:
1. Query open rows with the SQL above.
2. Group by `metadata->>'deferred_from_sd_key'` and by symptom-class to find recurrence.
3. File `SD-LEO-INFRA-*` / `QF-*` against the highest-signal clusters.
4. Mark resolved rows with `status='resolved'` and populate `resolution_notes` + `resolution_sd_id`.

## Format reference (historical, for git-blame archaeology)

The original file used two line formats:
- `2026-MM-DD | <symptom> | <file or command> | deferred from SD-...`
- `- 2026-MM-DD: <symptom prose>`

These have been parsed into structured `feedback` rows with `metadata.line_format`, `metadata.original_date`, `metadata.raw_line`, `metadata.source_location`, `metadata.deferred_from_sd_key`, and `metadata.imported_from='docs/harness-backlog.md'`.

## Do not append to this file.

Use the CLI. If you cannot run the CLI for any reason (offline, broken supabase env), append to a temporary scratch and migrate when you're back online — do **not** restore this file as a primary capture mechanism.

## Drain policy (SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001, 2026-07-10)

The `feedback` table (category='harness_backlog') was a chairman-ratified write-only sink: rows accumulated, nothing ever closed them. This SD made closure a write-time design property.

### Write-time terminal categories

Three category values are write-time-terminal — a row landing in one of them is never actionable and is structurally excluded from every "untriaged"/"enhancements" reader (see `lib/governance/feedback-terminal-categories.cjs` for the canonical list):

| Category | Meaning | Writer |
|---|---|---|
| `completion_flag_witness` | Zero-findings witness proving a completion-flag reflection ran | `scripts/capture-completion-flags.js` |
| `telemetry_aggregate` | Dashboard/counter-only rows, never row-per-event | (reserved for future writers) |
| `informational_note` | Ages out automatically after 30 days untouched | (reserved for future writers) |

Any reader that excludes `category='harness_backlog'` to build an "actionable" view **must** also exclude these three, or fresh terminal-category rows leak straight back into that view. Import `TERMINAL_CATEGORIES` from the canonical module rather than hand-rolling the exclusion list.

### Worker-signal promotion (the inbound hop)

`lib/coordinator/signal-router.cjs` `aggregateSignals()` runs on every coordinator sweep tick and writes the `harness_backlog` rows the sections below then act on. It groups `session_coordination` rows carrying `payload.signal_type` by content fingerprint over a 60-minute window and promotes a group on 3+ distinct callsigns **or** a single `critical` signal.

What a promoted row is guaranteed to carry (SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A):

| Field | Contract |
|---|---|
| `description` | The **full** signal body, up to `BODY_HARD_CAP` (4096), redacted via `lib/shared/body-cap.cjs` — the same policy the outbound hop (`scripts/worker-signal.cjs`) enforces. `description` is unbounded `text`. |
| `title` | The body's **first line**, bounded to 255 chars on a word boundary with an explicit `…` marker. `feedback.title` is `varchar(255)` — it is **not** unbounded like `description`; an over-length title fails the INSERT outright. |
| `metadata.contributing_signal_ids` | **Forward link** — every contributing `session_coordination.id`. This is the supported way to recover the original text. |
| `payload.routed_to_feedback_id` | Reverse link, stamped on each source row (unchanged). |

**Recovering the original signal body** — one query, no reverse walk:

```sql
SELECT body FROM session_coordination
WHERE id = ANY (
  SELECT jsonb_array_elements_text(metadata->'contributing_signal_ids')::uuid
  FROM feedback WHERE id = '<feedback-id>'
);
```

Two behaviours worth knowing when reading these rows: the body used to be silently cut at 500 characters, which destroyed a 3145-character correction down to 611 chars mid-word while still stamping it `critical` (QF-20260726-425) — rows promoted before that fix are truncated and their tails are only recoverable via the reverse link. And each fingerprint group is now processed in its own `try/catch`: a group that fails is logged with its fingerprint and `signal_type` rather than silently skipped, and cannot block the groups behind it in the same tick.

### Fingerprint promotion

`scripts/feedback-fingerprint-promoter.mjs` (scheduled via `.github/workflows/clockwork-feedback-fingerprint-promoter.yml`, every 6h) groups open `harness_backlog` rows by content fingerprint (`lib/shared/content-fingerprint.cjs` — the same primitive `lib/coordinator/signal-router.cjs` uses for worker-signal aggregation). A fingerprint with 3+ occurrences within a rolling 14-day window is promoted to exactly one QF-candidate via `scripts/create-quick-fix.js`, citing the fingerprint, occurrence count, and source row ids. Idempotent via `metadata.promoted_to_qf` on the source rows.

### Retro action item promotion

`scripts/promote-retro-action-items.mjs` (`.github/workflows/clockwork-retro-action-item-promoter.yml`, daily) promotes high-priority `retrospectives.action_items` directly to a QF — never through an intermediate `feedback` insert. Idempotent via `metadata.action_items_promoted` on the retrospective row.

### Age-out (archive-not-delete)

`scripts/feedback-age-out.mjs` (`.github/workflows/clockwork-feedback-age-out.yml`, daily) sets `feedback.archived_at` on `informational_note` rows untouched 30+ days. Rows are never deleted — `archived_at` is additive-only. Rows in any other category are structurally excluded from this job's query.

### Drain gauge

`node scripts/fleet-dashboard.cjs draingauge` (also included in the `all` render) shows open-actionable count (`category='harness_backlog' AND archived_at IS NULL AND status` not resolved-equivalent) and oldest-actionable-age, via an exact `count()` query — not a row fetch, which PostgREST implicitly caps at 1000 rows.

## S1 enumeration sweep — one-time legacy complement (SD-LEO-INFRA-HARNESS-BACKLOG-S1-ENUMERATION-SWEEP-001, 2026-07-10)

The drain policy above is write-time-forward: it closes rows going forward but never touched the pre-existing backlog that accumulated before it shipped. `scripts/one-off/s1-backlog-sweep.mjs` is the one-time complement — it paginates every open `harness_backlog` row (PostgREST-safe, 1000-row pages + `COUNT(*)` reconciliation, throws `PAGINATION_MISMATCH` on drift) and dispositions each into one of:

- **closed** — `classifyDoneState()` finds the underlying premise already shipped/dead (via `checkFeedbackPremiseLiveness`, widened to a 180-day completed / 30-day recent window) at `confidence_score >= 0.9`; archived with `category`, `archived_at`, and `resolution_notes` written atomically.
- **held_for_review** — plausible-but-unconfirmed closure; left open for a human/campaign pass rather than false-closed.
- **survivor** — genuinely open; grouped by content fingerprint (`FINGERPRINT_TYPE='harness_backlog_legacy_sweep'`) and promoted to a QF-candidate once a group hits `PROMOTION_THRESHOLD` (3), capped at `DEFAULT_MAX_PROMOTIONS` (15) per invocation.

It also folds in `retrospectives.action_items` and stale `flag_review` rows via the same defer-only decision path as the write-time policy (`scripts/chairman-decisions.mjs decide ... defer` — the sweep never auto-approves/rejects, per the chairman-decision constitutional rule in `lib/chairman/decision-queue.mjs`). `SIBLING_CLAIMED_IDS` excludes rows already claimed by concurrently-running sibling SDs to avoid double-processing.

**Not yet run at full scale.** The PR shipped the sweep script + tests only; a full `--apply` pass against the ~2,397-row legacy backlog is a deferred, budget-capped, multi-invocation follow-up (see the SD's PRD) — run in batches via repeated `node scripts/one-off/s1-backlog-sweep.mjs --apply` invocations, checking the printed ledger (`accountedFor` vs `liveCount`) between runs.
