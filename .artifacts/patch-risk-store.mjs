import fs from 'node:fs';
const f = '.artifacts/store-risk-capa-001-d.mjs';
let s = fs.readFileSync(f, 'utf8');

const block = `  critical_issues: [
    { severity: 'HIGH', issue: 'DEAD BY CONSTRUCTION: scope items 3+4 cannot produce a result. scoreWireframeFidelity reads venture_artifacts.artifact_type=stitch_design_export; AltifyAI has no such artifact (54 artifact types enumerated live) and its wireframe_screens payload carries no png/base64/url. The call returns status=no_screens; no stitch_qa_report is ever written; verifyDesignFidelityReviewed reads absent permanently.', recommendation: 'M1: descope items 3+4 to the C3.2 bind-criterion registration (all the DB scope actually asks for), or produce a real stitch_design_export artifact for AltifyAI first.' },
    { severity: 'HIGH', issue: 'GAUGE FALSE-CLEARS BY CONSTRUCTION: the stated X3 predicate is a GLOBAL existence check, so the single AltifyAI annex run this SD performs turns its own gauge green permanently while ApexNiche AI (status=active, stage 21) stays uncovered. The parent programme two-consecutive-weekly-zero-alarm criterion would be met trivially.', recommendation: 'M2: per-venture coverage semantics - alarm if ANY status=active venture at stage>=20 has zero venture_experience_review_runs rows.' },
    { severity: 'HIGH', issue: 'ACTIVE SIBLING FILE CONFLICT: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A (status=active, phase=EXEC, commit aa3ca9abd10) is editing lib/eva/quality-findings/finding-shape.js WARN_CAPPED_CATEGORIES, sd-generator.js, the stage-20-experience-warn-cap test, and adding a venture_quality_findings category CHECK-constraint migration - the exact validation and write path the -D annex run traverses, against the same venture (AltifyAI), in the same window.', recommendation: 'M5: rebase on the -A merged state and re-read WARN_CAPPED_CATEGORIES plus the live CHECK constraint at run time, not plan time.' },
  ],
  warnings: [
    { severity: 'HIGH', issue: 'Item 5 venture_stages migration is NOT confirmed non-chairman-gated; database/chairman-gated/20260913_venture_stages_is_high_consequence_stage24.sql is a same-day precedent and the SD own RISKS field already anticipates a ceremony packet.', recommendation: 'M3: PLAN reads the file against the chairman-gated classifier; the apply rides a ceremony packet, never a worker apply.' },
    { severity: 'HIGH', issue: 'Stage 15 metadata has NO gates key today (only metrics, stage_timeout_ms). A naive metadata assignment would destroy stage 15 metrics and timeout config.', recommendation: 'Use jsonb_set or || preserving metrics and stage_timeout_ms; assert post-apply that metadata->gates->exit is still absent.' },
    { severity: 'MEDIUM', issue: 'venture_experience_review_runs ships with no ENABLE ROW LEVEL SECURITY and no GRANT/REVOKE; repo precedent (chairman-gated 20260818_venture_stage_work_drop_public_select.sql) treats public-select on venture-stage tables as chairman-gated.', recommendation: 'M4: add RLS + explicit grants + a companion _rollback.sql + the approval header before apply.' },
    { severity: 'MEDIUM', issue: 'ZERO OBSERVATION YIELD: all 10 ventures at stage 15 are status=cancelled, zero active. The (15, design fidelity reviewed) bind criterion needs >=25 EXIT_GATE_OBSERVE_ONLY rows over >=48h and will stay at 0 indefinitely.', recommendation: 'Register it as an acknowledged inert placeholder, not an accruing instrument.' },
    { severity: 'MEDIUM', issue: 'A head:true count probe returned a FALSE exists (count:null, error:null) for the absent venture_experience_review_runs table during this very assessment.', recommendation: 'Use a real non-head select (PGRST205) for existence; in the gauge, throw on error AND on a non-finite count per wind-down-recurrence-check.mjs:22-30.' },
    { severity: 'MEDIUM', issue: 'GAUGE FALSE-ALARM: an unfiltered gte(current_lifecycle_stage,20) qualifies 56 ventures, 54 of them status=cancelled e2e/TEST-HARNESS fixtures that will never have a review run - the gauge would trip permanently from hour one.', recommendation: 'Filter status=active and consider excluding __e2e_ / TEST- name prefixes; unit-test that the 54 fixtures do not qualify and that one covered venture does not clear an uncovered one.' },
    { severity: 'MEDIUM', issue: 'SCOPE EXPANSION beyond the SD DB-recorded scope: the CLI wrapper, the verifyDesignFidelityReviewed verifier and the venture_stages stage-15 migration are not in C3.1/C3.2/X3. The DB scope also names TWO experience-review migrations; only ONE exists in the repo.', recommendation: 'M6: record the LEAD reframe (the annex-path substitution is endorsed as de-risking) and resolve the one-vs-two migration discrepancy in the LEAD-TO-PLAN handoff. Ratification 4730357d: a narrow factory correction, not a new framework.' },
    { severity: 'LOW', issue: 'persistWireframeFidelity UPDATE branch overwrites stitch_qa_report metadata in place with NO version bump (no prior-value audit trail). Safe today only because AltifyAI has no stitch_qa_report, so the INSERT branch would be taken.', recommendation: 'The one-shot CLI must call scoreWireframeFidelity directly, never iterateUntilPass (which re-scores and re-persists 3+ times).' },
    { severity: 'LOW', issue: 'resolveVerifier uses first-match-wins SUBSTRING matching over an ordered array. The string design fidelity reviewed shares no substring with any of the 22 existing keys in either direction.', recommendation: 'Append the new GATE_VERIFIERS entry at the END of the array so shadowing is impossible by construction.' },
  ],
  recommendations: [
    'M1 (BLOCKING): descope items 3+4 to the C3.2 registration, or produce a real stitch_design_export artifact for AltifyAI first.',
    'M2 (BLOCKING): rewrite the X3 gauge as per-venture coverage over status=active ventures; tri-state alarmed/clear/inapplicable; fail-loud on a non-finite count.',
    'M3: treat the stage-15 venture_stages migration as chairman-gated until PLAN proves otherwise; jsonb-merge preserving metrics/stage_timeout_ms; assert gates.exit stays absent.',
    'M4: add RLS + grants + rollback + approval header to 20260828_venture_experience_review_runs.sql before apply.',
    'M5 (BLOCKING): rebase on sibling -A finding-shape.js + the venture_quality_findings CHECK migration before running the annex against AltifyAI.',
    'M6: record the LEAD scope reframe and the one-vs-two migration discrepancy in the LEAD-TO-PLAN handoff.',
  ],
  execution_time_ms: 0,`;

if (!s.includes('  execution_time_ms: 0,')) throw new Error('anchor not found');
s = s.replace('  execution_time_ms: 0,', block);
fs.writeFileSync(f, s);
console.log('patched ok');
