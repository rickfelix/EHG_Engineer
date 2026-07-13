# Disaster Recovery Runbook — Single Machine, Single Database

- **Category**: Runbook
- **Status**: Active (backup entitlement pending chairman verification — see §1)
- **Author**: SD-LEO-INFRA-RESILIENCE-REVIEW-SPECIAL-001
- **Last Updated**: 2026-06-10
- **Evidence basis**: live resilience review of 2026-06-10 (read-only audit of
  Supabase project `dedlbzhpgkmetvhbkyzq` + the Windows estate under
  `C:\Users\rickf\Projects\_EHG`)

## The estate (what we are protecting)

One Windows 11 machine runs the entire LEO fleet (Claude Code sessions,
coordinator, harness crons, EVA scheduler daemon) across repos
`EHG_Engineer`, `ehg`, `datadistill`, plus the dedicated daemon clone
`eva-scheduler-host`. One hosted Supabase project (`dedlbzhpgkmetvhbkyzq`,
PostgreSQL 17.4, **5,722 MB**) is the single shared database for everything.
The two failure scenarios this runbook covers are **machine death** and
**database loss**.

## 1. Backup entitlement — CHAIRMAN-VERIFICATION PENDING

> **ACTION (chairman)**: open **Supabase Dashboard → Project Settings →
> Database → Backups** for project `dedlbzhpgkmetvhbkyzq` and record here:
> (a) plan tier, (b) daily-backup retention window, (c) whether PITR is
> enabled and its window. Until then, treat the DB as having **no verified
> restorable backup**.
>
> - [ ] Plan tier: ______
> - [ ] Daily physical backups: yes / no — retention ____ days
> - [ ] PITR enabled: yes / no — window ____ days
> - [ ] Verified by / date: ______

What IS verifiable from inside the DB (read-only `pg_settings`, 2026-06-10):
`archive_mode=on` with `archive_command = wal-push` (WAL-G) — platform WAL
archiving is running, so Supabase-side physical backup **infrastructure**
exists. The user-facing restore **entitlement** is plan-dependent and cannot
be read from SQL. No `pg_cron` extension; no in-DB backup jobs.

## 2. RPO / RTO targets (conditional on §1)

| Scenario | If entitlement = daily backups | If entitlement = PITR | If entitlement = none |
|---|---|---|---|
| DB loss — platform restore | RPO ≤ 24 h / RTO ≈ 1–4 h (support-driven restore) | RPO ≈ minutes / RTO ≈ 1–4 h | n/a |
| DB loss — dump-artifact fallback (§6.2) | RPO ≤ 7 days (weekly dump) for the **14 irreplaceable tables only** / RTO ≈ 1 day (schema rebuild + NDJSON re-insert) | same | same — this is the ONLY data recovery path |
| Machine death | RPO: pushed-git = 0; unpushed/uncommitted WIP = lost (see §3) / RTO ≈ 1–2 working days (§5) | same | same |

## 3. LOSS-ON-MACHINE-DEATH (evidence from 2026-06-10)

What dies with the box, in descending severity:

1. **Secrets** — `EHG_Engineer/.env` (40 keys), `.env.claude` (43 keys),
   `ehg/.env` (12) + `.env.production` (9), `eva-scheduler-host/.env` (40).
   All recoverable by re-issue (no provider lock-out), inventoried with
   re-issue sources in `.env.example` (FR-3) and rotation steps in
   `docs/security/key-rotation-runbook.md`. The only ad-hoc copy
   (`.env.bak-20260605-*`) lives on the same disk — not a backup.
2. **Unpushed git state** — at audit time: **375 dirty files** in the
   EHG_Engineer main tree (incl. `.claude/` session state and 30+
   `.prd-payloads/*.json`), **318 unpushed local-branch commits**, 14 active
   worktrees; `ehg` 3 dirty; `datadistill` 4 dirty; `eva-scheduler-host`
   clean. Mitigation: `scripts/prepark-wip.cjs` pushes fleet-worktree WIP to
   origin, but does NOT cover the main tree or `.claude/` state.
3. **All on-box automation** — Claude Code fleet + coordinator, harness crons
   (`scripts/cron/*`: eva-scheduler-watcher, cascade-watcher,
   leo-build-starter, quality-findings-aggregator), retention loop
   (`npm run retention:check|apply`), row-growth gauge, leo-stack dashboard.
   **None of these have an off-box twin.** The EVA Master Scheduler daemon
   runs from the dedicated clone `C:\Users\rickf\Projects\_EHG\eva-scheduler-host`
   (own `.env`) and has a documented 105-day silent-outage precedent.
4. **Claude Code harness state** — memory files (`~/.claude/.../memory/`),
   harness cron definitions, session/claim continuity (claims self-heal via
   DB staleness sweeps; memory does not).

What SURVIVES the box: all pushed git (GitHub: `rickfelix/EHG_Engineer`,
`rickfelix/ehg`, `rickfelix/datadistill`), the Supabase DB, the Vercel-hosted
`ehg` app, and ~25 scheduled GitHub Actions (incl. the weekly governance dump,
orphan-qf-reaper, clockwork monitors, leo-assist-periodic, leo-kb-refresh) —
their secrets live in GitHub Actions secrets, not on the box.

## 4. LOSS-ON-DB-DEATH (evidence from 2026-06-10)

If the Supabase project is lost without a platform restore path, ALL
governance state goes: **3,733** strategic_directives_v2, **2,973**
product_requirements_v2, **24,478** sd_phase_handoffs, **5,675**
retrospectives, **2,095** feedback, **1,333** issue_patterns, **262**
leo_protocol_sections (the protocol source — generated `CLAUDE_*.md` in git
is a stale partial mirror), user_stories, eva_vision_documents,
leo_feature_flags, plus the EVA venture state. The fleet cannot operate
(database-first protocol).

What survives in git: all code, **1,116** migration files
(`database/migrations/`, 16 DOWN), the committed column-level schema snapshot
`database/schema-reference-snapshot.json` (733 tables / 167 views), and the
schema-only `pg_dump` taken by `housekeeping-prod-promotion.yml` at promotion
time. **Schema is rebuildable; data was not — until FR-2** (§6.2): the weekly
governance dump artifact now holds the 14 irreplaceable tables off-DB
(first full run 2026-06-10: **51,816 rows / 412 MB NDJSON**, 90-day artifact
retention).

In-DB "backups" that die WITH the DB (do not count them as DR):
`retention_archive` (196,007 rows / 362 MB), the `*_quarantine_*` /
`*_purge_backup_*` tables (e.g. `management_reviews_quarantine_20260610`,
45,015 rows), `sub_agent_execution_results_archive`. They protect against bad
purges, not DB loss.

## 5. Machine-rebuild walkthrough

Estimated RTO: 1–2 working days. Order matters.

1. **New machine prep**: install Git, Node 22+, GitHub CLI; authenticate
   `gh auth login` (GitHub account is the recovery root — protect it with
   hardware 2FA).
2. **Clone repos** into `C:\Users\rickf\Projects\_EHG\`:
   `EHG_Engineer`, `ehg`, `datadistill`; clone `EHG_Engineer` a second time
   as `eva-scheduler-host` (dedicated daemon clone). `npm ci` in each.
3. **Recover WIP**: `git fetch --all`; check `origin` for prepark-WIP
   branches (`scripts/prepark-wip.cjs` pushes them). Anything not pushed is
   gone — accept and re-derive from DB state (`npm run sd:next` shows
   in-flight SDs; the DB, not the working tree, is the source of truth).
4. **Rebuild `.env` files**: walk `.env.example` top-to-bottom (it is the
   full key inventory with re-issue sources — FR-3); rotate every secret per
   `docs/security/key-rotation-runbook.md` (assume the old disk is
   compromised). Update the same values in GitHub Actions secrets where
   shared (`gh secret set …`). Copy the finished `.env` + `.env.claude` into
   `eva-scheduler-host/` (its env contract is identical to `EHG_Engineer/.env`
   — same 40 keys, verified 2026-06-10 — plus the `.env.claude` layer; the
   daemon itself needs `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, and optional `EVA_SCHEDULER_*` tuning per
   `docs/06_deployment/eva-scheduler-watcher-cadence.md`).
5. **Relaunch the EVA scheduler**: from `eva-scheduler-host/`, run
   `npm run eva:scheduler:watch:cron` once (single-winner revive), then
   verify `npm run eva:scheduler:status` shows a fresh heartbeat.
6. **Re-arm harness crons** in a Claude Code session (CronList/CronCreate):
   eva-scheduler-watcher (5 min), cascade-watcher, retention loop, row-growth
   gauge, coordinator hourly review — see `scripts/cron/` and the
   STANDARD_LOOPS arming conventions.
7. **Restart leo-stack**: `node scripts/cross-platform-run.js leo-stack restart`.
8. **Verify**: `npm run sd:next` (DB reachable, queue renders),
   `npm run test:unit` green, one `/loop` worker completes a wake cycle.

## 6. DB-recovery walkthrough

### 6.1 Primary path — platform restore (requires §1 entitlement)

1. Supabase Dashboard → Database → Backups → restore latest daily backup /
   PITR point. If the project itself is gone, open a Supabase support ticket
   immediately (paid plans retain backups server-side for a window even after
   project deletion — confirm in §1).
2. After restore: verify row counts against §4 figures, re-point nothing
   (project ref unchanged), restart on-box daemons, and run
   `npm run dr:rehearse` as a post-restore smoke.

### 6.2 Fallback path — rebuild from git + weekly dump artifact

1. Create a fresh Supabase project; set new connection values everywhere
   (`.env`, GitHub secrets, Vercel env).
2. Rebuild schema: apply `database/migrations/` in timestamp order (use
   `npm run migration:apply-state` to verify convergence; expect the known
   committed-not-applied backlog — see docs/database/committed-unapplied
   sweeps). Cross-check against `database/schema-reference-snapshot.json`.
3. Restore data: download the newest `governance-dump-<run_id>` artifact from
   the **Governance Data Dump (DR)** workflow (90-day retention, weekly).
   Each `<table>.ndjson` line is `to_jsonb(row)`; re-insert with
   `jsonb_populate_record(NULL::public.<table>, line::jsonb)` — this exact
   path is proven weekly-restorable by `npm run dr:rehearse` (drill A).
   `manifest.json` carries per-table row counts + sha256 for verification.
4. Accept the loss boundary: audit/trace tiers (~4 GB) and anything outside
   the 14-table allowlist (`scripts/dr/governance-dump-allowlist.json`,
   rationale per table) are NOT in the artifact.

### 6.3 What we deliberately do NOT rehearse

Full PITR/physical restore on the live project (overwrites the single shared
prod DB), project pause/restore, restoring into the live schema. Tabletop
only.

## 7. Restore rehearsal — procedure + latest result

Procedure: `npm run dr:rehearse` (read-only against sources; every statement
is whitelist-classified and audited; all writes land in a throwaway
`dr_rehearsal_<yyyymmdd_hhmm>` schema that a `finally` block drops even on
failure). Drill A samples ≤500 `retention_archive` rows for
`workflow_trace_log` and proves the documented "re-insert `row_data`" restore
path with field-level fidelity asserts; drill B copies a sample of
`management_reviews_quarantine_20260610` and asserts per-row
`md5(row::text)` identity. Cadence (QF-20260712-917, D6): automated monthly via
`.github/workflows/dr-restore-rehearsal-cron.yml` (1st of month, 06:00 UTC;
also `workflow_dispatch`-able on demand) — monthly trivially satisfies both the
"quarterly baseline" and "monthly while schema churn is high" chairman-ratified
targets without needing runtime churn detection. Also run manually after any
retention/quarantine schema change or platform restore. Each run stamps
`periodic_process_registry` (`gha_cron:dr-restore-rehearsal-cron.yml`) and
rewrites the witness below via `scripts/dr/stamp-rehearsal-result.mjs`.
PRECONDITION for `SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001`'s `retention_archive`
365d TTL step: do not enable that TTL until a rehearsal PASS below is <90d old.

**Latest live run — 2026-07-13T03:06:17.381Z: `PASS`** (scratch schema
`dr_rehearsal_20260713_0306`, 1.3 s):

| Drill | Result |
|---|---|
| A — retention_archive → workflow_trace_log | PASS — 500 rows restored, **8,500 field checks, 0 mismatches**, 0 schema-drift keys, 0 missing rows |
| B — quarantine copy md5 identity | PASS — 500/500 rows, md5 sets identical |
| Statement audit | 13 statements: 5 reads, 8 scratch-writes, **0 forbidden** |
| Cleanup | scratch schema dropped |

First full dump-driver run (same day, local, `scripts/temp/` — not
committed): 14/14 tables, 51,816 rows, 412.0 MB NDJSON in ~98 s.

## 8. Artifact index

| Artifact | Path |
|---|---|
| Restore rehearsal CLI | `scripts/dr/restore-rehearsal.mjs` (+ `restore-rehearsal-core.mjs`, tests in `tests/unit/dr-restore-rehearsal.test.js`) |
| Governance dump driver | `scripts/dr/governance-dump.mjs` |
| Dump allowlist + per-table rationale | `scripts/dr/governance-dump-allowlist.json` |
| Weekly off-box dump workflow | `.github/workflows/governance-data-dump.yml` (Sundays 05:00 UTC + dispatch) |
| Secrets inventory (Engineer) | `.env.example` (full key-name parity incl. `.env.claude` distinct keys) |
| Secrets inventory (ehg app) | `ehg/.env.example` (sibling repo) |
| Key rotation procedures | `docs/security/key-rotation-runbook.md` |
| EVA daemon revive runbook | `docs/06_deployment/eva-scheduler-watcher-cadence.md` |
| Schema snapshot | `database/schema-reference-snapshot.json` |
| Schema-only prod backup (promotion-time) | `.github/workflows/housekeeping-prod-promotion.yml` → `ops/audit/prod_schema_before_*.sql` |
