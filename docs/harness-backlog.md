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
