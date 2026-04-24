# LEO Protocol Consistency Linter — Reference

Owners: Protocol maintainers
Related SDs: **SD-PROTOCOL-LINTER-001** (detection engine), **SD-PROTOCOL-LINTER-DASHBOARD-001** (dashboard)

The Protocol Consistency Linter detects drift across the `CLAUDE.md` family (thresholds, enums, versions, duplicate authoritative lists, etc.). This document covers day-to-day usage: CLI, audit tables, and the admin dashboard.

---

## CLI

| Command | Purpose |
|---|---|
| `npm run protocol:lint` | On-demand audit. Writes to `leo_lint_violations`, `leo_lint_run_history`. Exits non-zero on block-severity violations. |
| `npm run protocol:lint:test` | Run rule fixtures (positive + negative). CI uses this to verify rules themselves. |
| `npm run protocol:lint:promote <rule-id>` | Promote a warn-severity rule to block after ≥2 consecutive clean regen runs. |

**Auto-run**: The linter executes inside `generate-claude-md-from-db.js` after DB fetch and before file writes. Block-severity violations abort the regen.

**Bypass (rate-limited, 3/week)**:
```bash
node scripts/generate-claude-md-from-db.js --skip-lint --skip-reason "<text>"
```
Bypasses log to `leo_lint_run_history` with `trigger='bypass'` and non-null `bypass_reason`.

---

## Admin Dashboard (`/admin/protocol-lint`)

SD-PROTOCOL-LINTER-DASHBOARD-001 ships a read-only React dashboard in the EHG app surfacing the linter's audit tables without requiring SQL.

**Access**: `/admin/protocol-lint` (port 8080), gated by `AdminRoute` (requires role = chairman / executive / system_admin_ops / admin).

**What it shows**:
- **7-day trend chart**: daily violation counts (total / block / warn) at the top of the page.
- **Violations tab** (default): filterable table by severity, rule_id, file path. Paginated 25/page. Empty-state renders when pre-corrective-migration.
- **Rules tab**: active rule registry with occurrence count (last 7 days) and `promotion_eligible` badge for warn-severity rules with zero violations across the last 2 regen runs.
- **Runs tab**: last 30 days of lint runs (trigger, exit-code, duration, `bypass_reason` for audit).

**Refresh cadence**: Each table polls every 30s via the `adminApi` service. No WebSocket/SSE — matches `AdminDashboard` convention.

**Empty-state behavior**: Before `leo_lint_violations` is populated by the corrective migration, each section renders a card explaining the state instead of a blank screen.

### API (consumed by the dashboard)

Mounted under `/api/admin/protocol-lint` in EHG_Engineer (port 3000), gated by `requireAuth + requireAdminRole`:

| Endpoint | Returns |
|---|---|
| `GET /violations?page=&pageSize=&severity=&rule_id=&file=&section_id=&status=` | `{ data: LintViolation[], total, page, pageSize, generated_at }` |
| `GET /rules` | `{ data: LintRule[], total, regen_runs_considered, generated_at }` (includes server-computed `promotion_eligible` + `occurrence_count_last_7d`) |
| `GET /runs` | `{ data: LintRun[], total, window_days, generated_at }` — 30-day window |
| `GET /trend` | `{ data: TrendBucket[], window_days, generated_at }` — 7-day UTC-aligned daily buckets |

All endpoints:
- Set `Cache-Control: no-store`
- Are read-only (promotion stays on the CLI per SD key_principle)
- Do not mutate any audit tables

### Common workflows

**Triage drift weekly** (~2 min):
1. Open `/admin/protocol-lint`
2. Inspect the 7-day trend chart — is the count climbing?
3. If yes, switch to the Violations tab, filter by `severity=block`
4. For each unique `rule_id`, open the Rules tab and read the description to decide fix vs. dismiss.

**Find promotion candidates**:
1. Open the Rules tab.
2. Look for the "Eligible to promote" badge (warn-severity + 0 violations in last 2 regen runs).
3. Run `npm run protocol:lint:promote <rule-id>` in a terminal.

**Audit a linter bypass**:
1. Open the Runs tab.
2. Filter rows where `trigger=bypass` (destructive-badge styling).
3. `bypass_reason` column shows the explanation provided at `--skip-reason`.

---

## Audit tables

| Table | Purpose |
|---|---|
| `leo_lint_rules` | Rule registry. `severity IN (warn, block)`. Promotion tracked via `promoted_from_warn_at`. |
| `leo_lint_violations` | Append-only violations. Columns: `violation_id, run_id, rule_id, section_id, file_path, severity, message, context, status, status_reason, detected_at, resolved_at, resolved_by`. |
| `leo_lint_run_history` | One row per run. `trigger IN (regen, audit, bypass, precommit)`. `passed` reflects whether any block-severity violation fired. |

**Indexes** (already applied by SD-PROTOCOL-LINTER-001):
- `idx_leo_lint_violations_status_detected (status, detected_at DESC) WHERE status=open`
- `idx_leo_lint_violations_rule_detected (rule_id, detected_at DESC)`
- `idx_leo_lint_run_history_started (started_at DESC)`
- `idx_leo_lint_run_history_trigger_started (trigger, started_at DESC)`
- `idx_leo_lint_rules_enabled (enabled) WHERE enabled=true`

---

## Implementation locations

| Item | Path |
|---|---|
| Rule engine | `scripts/protocol-lint/engine.mjs` |
| Declarative rules | `scripts/protocol-lint/rules/declarative/*.json` |
| Code rules | `scripts/protocol-lint/rules/code/*.mjs` |
| Rule fixtures | `scripts/protocol-lint/fixtures/*.json` |
| Dashboard API | `server/routes/protocol-lint.js` (EHG_Engineer) |
| Dashboard UI | `src/pages/admin/ProtocolLint.tsx` + `src/components/admin/protocol-lint/*.tsx` (EHG app) |
| Migration | `database/migrations/20260422_protocol_linter_tables.sql` |

## Adding a rule

New rules ship at `severity='warn'`. After 2+ consecutive regen runs with zero violations, run `npm run protocol:lint:promote <rule-id>` to elevate to `severity='block'`. Every rule must include a positive fixture (triggers detection) and a negative fixture (does not trigger).
