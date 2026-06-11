# Security Posture Review — 2026-06-10

## Metadata
- **Category**: Report
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: SECURITY sub-agent + worker Echo (SD-LEO-INFRA-SECURITY-POSTURE-REVIEW-001)
- **Last Updated**: 2026-06-10
- **Tags**: security, rls, keys, autonomy, audit

> Point-in-time, **read-only** whole-surface posture baseline. No remediation was performed by this review — every actionable finding is filed as a durable feedback flag (IDs in the remediation queue below). Evidence row: `sub_agent_execution_results` `df16afbe`. Re-run the census probes to diff against this baseline.

## Baseline (live, 2026-06-10)

| Measure | Value |
|---|---|
| Public tables | 733 |
| RLS-enabled | 705 |
| RLS-disabled | 28 |
| RLS-on, zero policies (fail-closed) | 8 |
| SECURITY DEFINER functions | 118 (30 trigger fns excluded — see TRIGGER-ESTATE-AUDIT-001) |

## Finding summary: 1 HIGH · 3 MED · 2 LOW · 24 ACCEPTED

---

## Surface 1 — RLS coverage

### 28 no-RLS tables — adjudication
All 28 carry full **anon + authenticated DML grants** (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) — PostgREST default grants with no RLS to constrain them.

**ACCEPTED with pointer (24 — quarantine/backup/parity, no live consumers):**
- 17× `*_qparity20260610` parity-fixture snapshots (zero live code consumers; referenced only in auto-generated schema docs)
- `management_reviews_quarantine_20260610` (45,015 rows — purge backup; drop eligible 2026-06-24 per the retention soak entry)
- `sd_baseline_items_purge_backup_20260609` (12,932), `sd_baseline_items_recon_backup`, `venture_artifacts_storm_quarantine_20260610` (2,684)
- Disposition: fold into the existing quarantine-drop/soak schedule; these are historical copies whose loss is recoverable from their sources or acceptable post-soak. *(Their anon-reachability is still covered by the F-1 flag below since several hold governance data.)*

**LIVE-OPERATIONAL exposure (4) — Finding F-1, HIGH (aggregate):**
| Table | Rows | Exposure |
|---|---|---|
| `retention_archive` | 196,007 | **Anon can read AND write/delete** the cold archive of governance/audit rows via PostgREST — the most material exposure in this review (archive tampering = silent loss of audit history) |
| `retention_runs` | 7 | Anon-writable liveness stamps (could forge freshness) |
| `coordination_events` | 2 | Anon-writable fleet coordination channel |
| `app_config_kill_switch_changes` | 0 | Anon-writable kill-switch audit trail |

**Remediation queue**: enable RLS (service-role-only policies) on these 4 — small reversible migration. Flag: `posture-F1`.

### 8 RLS-on, zero-policy tables — CONFIRMED fail-closed (LOW / no action)
`_migration_metadata, batch_operation_log, brainstorm_vote_tallies, eva_friday_decisions, eva_friday_meetings, eva_preferences, opportunity_categories, opportunity_scores` — RLS-on + 0 policies = deny for anon/authenticated. Consumer grep confirms **all live consumers use the service-role client** (RLS-bypass); no code path expects non-service-role access. Intent verdict: service-role-only, working as designed.

---

## Surface 2 — Key surfaces

| Surface | Contents | Blast radius if leaked |
|---|---|---|
| `.env` (gitignored) | 39 key names (SUPABASE service-role/anon/JWT/DB password; ANTHROPIC, OPENAI, GEMINI, RESEND, SENTRY, STITCH, YOUTUBE, TODOIST, GOOGLE_CLIENT_SECRET) | Service-role = full RLS-bypass DB control; pooler URL = direct SQL |
| `.claude/settings.json` env | **Feature flags only — no secrets** (committed-safe) | n/a |
| GitHub workflows | `secrets.*` mechanism (correct); `adam-exec-email-cron.yml` uses RESEND + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL | Repo-secret compromise = service-role |
| Tracked code | **0 hardcoded secrets** (only the secret-scanner's own regexes match) | n/a |
| `lib/supabase-client.cjs` | Anon-write **governance guard present** | guarded |
| `lib/supabase-client.js` (ESM) | **Finding F-2, MED**: `createSupabaseClient()` returns a raw unguarded anon client — **49 import sites**. RLS still blocks the writes; the gap is silent-drop observability (known open flag, re-confirmed) | silent RLS-dropped writes |

Cross-referenced open chain (not re-implemented here): GUARD-ANON ESM gap (23132a29), SCOPE-ANON-KEY phase 2 (72bc2d16), hosted-signup toggle (a8043e76).

---

## Surface 3 — Autonomy blast radius (all LOW residual)

| Writer | Trigger | Worst case | Guards |
|---|---|---|---|
| `stale-session-sweep.cjs` | 5-min loop | release live claim / phase reset | fail-soft containment + SD-TEST exclusion (shipped 2026-06-10), accepted-handoff gate, dead-PID-only, hard-cap pid_alive hold |
| `worktree-reaper.mjs` | cadence | `rm -rf` worktree | dry-run default, `--execute` required, active claim/QF protection, preserve-before-delete |
| `retention-enforce.js --apply` | weekly (arming pending) | DELETE aged audit rows | dry-run default, chairman-gated windows, **archive-before-delete invariant**, per-run caps, per-table fail-soft |
| `apply-migration.js --prod-deploy` | manual | live DDL | 3-factor: flag + @approved-by email match + single-use SHA256 token (1h TTL) |
| claim-release / QA resets | sweep | phase regression | handoff-gate + single fail-soft containment point |

`purge-mgmt-reviews` family: archived one-time scripts; their quarantine residue is in Surface 1.

---

## Surface 4 — SECURITY DEFINER census (118)

| Class | Count | Notes |
|---|---|---|
| Trigger fns (excluded) | 30 | TRIGGER-ESTATE-AUDIT-001 owns these |
| EXECUTE revoked (fail-closed) | 62 | |
| Internally guarded | 14 | **Every high-privilege destructive fn IS chairman-gated** (`delete_venture`, `kill_venture`, `approve/reject_chairman_decision`, `set_global_auto_proceed`, `set_stage_override`, `park_venture_decision`, `reset_eva_circuit`, `log_stage_advance_override` + authz primitives) |
| **Unguarded + caller-executable** | **12** | Finding F-3 below |

**Finding F-3, MED→HIGH class (the rescan_stage_20 family):** 8 **mutating**, authenticated-executable, RLS-bypassing fns with no in-fn authz: `advance_venture_stage`, `advance_venture_to_stage`, `bootstrap_venture_workflow`, `create_eva_conversation`, `eva_circuit_allows_request`, `record_eva_failure`, `record_eva_success`, `rescan_stage_20`. Plus 4 read-only (2 of them **anon-executable** — `check_feedback_rate_limit`, `get_gate_decision_status` — info-disclosure tier, **F-4 MED**).

**Remediation queue**: guard-or-revoke pack mirroring the defense-depth pattern for the 8 mutating fns (extends the open rescan_stage_20 flag f116c356 to its whole class).

---

## Remediation queue (flags filed)

| # | Tier | Finding | Flag |
|---|---|---|---|
| F-1 | HIGH | RLS + service-role-only policies for the 4 live no-RLS tables (retention_archive first) | posture-F1 |
| F-3 | HIGH-class | Guard/revoke pack for the 8 unguarded mutating SECURITY DEFINER fns | posture-F3 |
| F-2 | MED | ESM anon-client guard port (re-confirms open flag 23132a29 — 49 import sites quantified) | existing flag |
| F-4 | MED | Revoke anon EXECUTE on the 2 info-disclosure fns | posture-F3 (bundled) |
| — | ACCEPT | 24 quarantine/backup tables — fold into soak/drop schedule | tracked by retention soak entries |

*Self-finding disclosed in good faith: `retention_archive`/`retention_runs` were created earlier today by this same worker's retention SD — the migration omitted RLS; F-1 corrects the class.*
