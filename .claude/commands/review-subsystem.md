<!-- reasoning_effort: high -->

---
description: "Run a chairman-grade subsystem review: live ground-truth inventory -> code cross-reference -> hand-verified, evidence-cited SD filings -> coordinator/Adam notification -> chairman digest. Usage: /review-subsystem <harness|protocol|data-layer|eva-pipeline|test-estate|scripts-estate|security|docs>"
---

<!-- HAND-AUTHORED: codified from the chairman's four hand-driven reviews of 2026-06-10
     (harness, protocol, data layer, EVA pipeline -> 27 evidenced draft SDs).
     SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001. -->

# /review-subsystem — chairman-grade subsystem review

You are running a **subsystem review**: a read-heavy audit that converts live
ground truth into evidenced, actionable draft SDs. The four reviews this recipe
was distilled from produced 27 SDs in one day — the leverage comes from the
discipline, not the volume.

**ARGUMENTS**: one subsystem name from the rotation registry
(`lib/coordinator/subsystem-review-rotation.cjs` SUBSYSTEMS):
`harness | protocol | data-layer | eva-pipeline | test-estate | scripts-estate | security | docs`

## THE QUALITY BAR (non-negotiable)

1. **Live evidence only.** Every finding cites a live query result, a
   `file:line`, or a row count. Findings derived from docs/READMEs/memory are
   FORBIDDEN — docs describe intent; you are auditing reality.
2. **Hand-verify before filing.** Every claim that reaches an SD is re-checked
   individually against the live source (DB row, catalog entry, file content).
   Scan artifacts go stale within hours; re-verify before acting.
3. **Cross-reference shipped fixes.** Query recent completed SDs/PRs touching the
   subsystem so findings are NET-NEW. Audit the SIBLINGS of fixed functions —
   post-incident hardening usually fixed the file touched, not the class.
4. **Grade severity with evidence** (HIGH/MEDIUM/LOW) and give every clean
   surface an explicit clean bill — absence of findings must be a statement,
   not silence.

## RECIPE (in order)

1. **Claim context**: run the review under an SD (create one via
   `/sd-create` or run inside an assigned review SD). The SD MUST stamp
   `metadata.subsystem_review = '<subsystem>'` — this is how the rotation
   knows the review happened (stateless registry).
2. **Inventory ground truth** using the subsystem playbook below. Prefer:
   live DB queries (service-role — anon RLS returns false-negatives on
   `feedback` and peers), pg catalogs via the Supabase MCP `execute_sql` tool
   (`pg_class`, `pg_trigger`, `pg_proc`, `pg_attribute` — census first, then
   risk-prioritized detail batches), `validation_audit_log`, and live log/heartbeat rows.
3. **Cross-reference against code**: grep/Explore the repo for consumers,
   writers, and contracts of every inventoried surface. Single-repo scans
   cannot adjudicate a shared DB — check both repos when the surface is shared.
4. **Hand-verify every candidate finding** (quality bar #2).
5. **File the outputs**:
   - The review artifact: `docs/audits/<SD-KEY>.md` (inventory + findings +
     clean bills + consolidation proposals).
   - MEDIUM+ findings as `feedback` rows (`source_application`, `source_type`
     NOT NULL; `metadata.sd_key` + a finding kind) so they survive the session.
   - Tier-3-shaped fixes as draft SDs via `/sd-create` with the evidence inline.
6. **Notify**: coordinator inbox row (`session_coordination` INFO,
   `payload.kind='review_supply_result'`, count + headline) and an Adam
   grooming note (plain feedback row — Adam's sourceableBacklog drops
   flag-class rows).
7. **Digest to the chairman**: a compact summary (subsystem, N findings by
   severity, top-3 headline items, artifact + SD links) via the established
   digest channel for the session.

## SUBSYSTEM PLAYBOOKS

### harness
- **Ground truth**: `validation_audit_log` (gate-FP leaderboard: failures by gate over 7d),
  `sd_phase_handoffs` rejection reasons, `claude_sessions`/`session_coordination` lifecycle rows,
  bypass-reason fields (an unmined work queue), hook files in `scripts/hooks/` vs `.claude/settings.json` registration.
- **Cross-ref**: gate executors under `scripts/modules/handoff/executors/`, claim machinery (`scripts/stale-session-sweep.cjs` release paths vs `evaluateSourceSideSignals`).
- **Known classes**: gate false-positives, silence-bypass claim releases, stale-host hooks, UV-abort commit loss.

### protocol
- **Ground truth**: `leo_protocol_sections` (publication_status coverage; `npm run protocol:pub-audit`),
  generated-file hashes (`verifyFileContentHash`), `leo_feature_flags` truthfulness, protocol version vs section churn.
- **Cross-ref**: section-file mapping JSONs, generator modules, live by-type/by-id section queries (grep ref-counts LIE — only live queries count).
- **Known classes**: dark sections, mapping drift, digest staleness, retired-content rot.

### data-layer
- **Ground truth**: pg catalogs via MCP `execute_sql` — table/view/trigger census, `reltuples` (or PostgREST
  `{count:'estimated', head:true}`), phantom columns vs `pg_attribute`, orphan FK scans. Reuse the
  data-layer scan recipe (.claude/data-layer-scan-results.json provenance) and `ROW_GROWTH_SNAPSHOT` series.
- **Cross-ref**: every `from('<table>')` site in BOTH repos; migration files vs live state (`npm run migration:apply-state`).
- **Known classes**: phantom-column writes (silent 42703 in fire-and-forget), committed-not-applied migrations, dead tables, unbounded growth, null-unsafe triggers.

### eva-pipeline
- **Ground truth**: `eva_scheduler_heartbeat` (incl. `build_provenance.git_sha` vs origin/main — stale-host detection),
  `eva_scheduler_metrics`, `okr_generation_log`, `venture_artifacts` distribution vs `stage_artifact_requirements`, `eva_events` backlog.
- **Cross-ref**: `lib/eva/eva-master-scheduler.js` job/round registries + observe-gates; stage templates; watcher hosting path.
- **Known classes**: stale daemon builds (SHIP-vs-FLIP), observe-only bypasses, orphaned scheduler queues, raw-JSON KR titles.

### test-estate
- **Ground truth**: full-tier run results (counts of red files/tests on origin/main), flaky-intel rows, mock-vs-live column pins, configs census (dual roots).
- **Cross-ref**: db-guards auditor enforcement; tests attempting live INSERTs into prod tables; twins/duplicated suites.
- **Known classes**: mock-chain rot, drifted column pins, 0xC0000409 abort class, pre-existing red on main (stash-verify before blaming your change).

### scripts-estate
- **Ground truth**: scripts census vs `package.json` entries (orphans = no importer AND no npm entry AND no doc invocation), archive lag, scratch-dir sprawl, WIRE_CHECK exemption usage.
- **Cross-ref**: call-graph reachability (the WIRE_CHECK entry-point model), pre-commit/CI references to scripts.
- **Known classes**: dead-on-arrival files, unwired guards (built but never registered), superseded jobs still armed.

### security
- **Ground truth**: SECURITY DEFINER functions census (pg_proc), RLS policy coverage per table (pg_policies), key/env handling in hooks and CLIs, `EMERGENCY_*` bypass usage logs.
- **Cross-ref**: authz guards on chairman/service paths; anon-vs-service client usage in scripts.
- **Known classes**: missing internal authz on DEFINER RPCs, anon-key false-negatives masking data, bypass envs left enabled.

### docs
- **Ground truth**: docs/ tree vs reality — broken links, retired content still authoritative-looking, CHANGELOG coverage of merged PRs, `*_DIGEST` staleness.
- **Cross-ref**: docs referencing deleted scripts/tables (pair with scripts-estate + data-layer outputs); supersession banners.
- **Known classes**: doc-derived folklore contradicting live contracts (the reason the evidence bar exists).

## OUTPUT CONTRACT

The review is DONE when: the artifact is merged (docs-only PR), MEDIUM+ findings
are durable feedback rows, Tier-3 candidates are draft SDs with evidence, the
coordinator + Adam notifications are posted, the chairman digest is emitted, and
the review SD completes with `metadata.subsystem_review` stamped (the rotation
advances off that stamp).

## Metadata
- **Category**: Protocol
- **Status**: Approved
- **Version**: 1.0.0
- **Last Updated**: 2026-06-10
- **Tags**: review, audit, rotation, fleet, evidence
- **Author**: SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001
