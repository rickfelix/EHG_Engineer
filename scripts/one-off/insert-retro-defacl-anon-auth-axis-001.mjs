/**
 * SD-COMPLETION retrospective writer for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001.
 *
 * Uses the canonical writer (lib/sub-agents/retro/db-operations.js storeRetrospective)
 * plus the canonical learning-category normalizer. No hand-rolled INSERT.
 *
 * A fresh insert is required: the only existing retrospectives row for this SD is a
 * retro_type='HANDOFF' row from LEAD_TO_PLAN, which retro-filters.js's
 * getFilteredRetrospective correctly excludes (retro_type must be SD_COMPLETION).
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { storeRetrospective } from '../../lib/sub-agents/retro/db-operations.js';
import { normalizeLearningCategory } from '../../lib/retro/learning-category.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SD_UUID = '6b32a991-f177-467b-b1a3-8f053519f6e1';
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const retrospective = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  target_application: 'EHG_Engineer',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: `${SD_KEY} Retrospective — REVOKE FROM PUBLIC was a no-op; the real leak was per-role default ACLs, and re-measuring at EXEC halved the scope`,
  description:
    'This SD stages (chairman-gated, never applied inline) a per-role ALTER DEFAULT PRIVILEGES REVOKE '
    + 'for postgres/supabase_admin on functions in schema public '
    + '(database/chairman-gated/20260816_defacl_anon_auth_axis.sql + _DOWN.sql), closing the '
    + 'FUTURE-function half of an anon/authenticated EXECUTE-by-default leak that the predecessor SD '
    + "(SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001) left open: that predecessor's REVOKE FROM PUBLIC "
    + 'ADP is a structural no-op on this axis because PostgreSQL grants anon/authenticated EXECUTE by '
    + "role name in pg_default_acl, not via a literal PUBLIC entry. It also extends "
    + 'scripts/audit-rpc-execute-grants-buckets.json with 3 previously-undeclared anon-EXEC KEEP '
    + 'functions, and ships a two-axis (--baseline/--verify/--self-test/--hash) acceptance script plus '
    + 'extended unit tests. '
    + 'The retrospective substance is five review-phase catches, not the migration itself: '
    + '(1) a prospective TESTING review before the PRD was fully authored found ALTER DEFAULT PRIVILEGES '
    + 'is FUTURE-SCOPED ONLY and reshaped the acceptance script into two independent proof axes; '
    + "(2) a live EXEC-time full-surface census found the original FR-2 scope (re-triage all "
    + '28/41/18 exposed functions) was overstated by 25/28 — the predecessor SD had already triaged '
    + 'them, cutting the real gap to 3 manifest entries; '
    + '(3) a SECURITY EXEC review caught the DOWN migration re-granting PUBLIC when the live catalog '
    + 'showed PUBLIC never held that grant, which would have left post-rollback state broader than '
    + 'pre-apply baseline; '
    + '(4) a VALIDATION PLAN-verification pass caught that the FR-2 rescope correction had not '
    + 'propagated to the PRD\'s top-level acceptance_criteria, FR-3, FR-4, and risks[2], which still '
    + 'described the pre-correction plan; '
    + '(5) CLAUDE_PLAN.md\'s "Testing Tier Strategy (Updated)" heading was found genuinely empty when '
    + 'TESTING went looking for a documented infra/security/no-UI E2E exemption for this pure-DB, '
    + 'zero-UI SD.',
  conducted_date: new Date().toISOString().split('T')[0],
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['TESTING', 'SECURITY', 'VALIDATION', 'DATABASE', 'DESIGN', 'RISK', 'REGRESSION', 'VISION_FIDELITY', 'Explore'],
  human_participants: ['Chairman'],
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  learning_category: normalizeLearningCategory('SECURITY_VULNERABILITY'),
  auto_generated: false,
  trigger_event: 'PLAN_VERIFICATION_COMPLETE',

  what_went_well: [
    'A prospective TESTING sub-agent review run BEFORE the PRD was even fully authored caught that ALTER DEFAULT PRIVILEGES is FUTURE-SCOPED ONLY — it does nothing to the 28/41/18 already-exposed functions. The original SD title/scope had conflated "fix the default" with "fix the existing exposed functions" as one mechanism; they are two independent mechanisms needing two independent proofs. This single catch reshaped the acceptance script into a two-axis (--baseline/--verify) design from the start, rather than discovering the gap after the migration was written.',
    'A live, full-surface census (.artifacts/defacl-full-census.json) run at EXEC time — not trusted from the LEAD-phase proposal — found the original FR-2 scope (re-triage all 28/41/18 exposed functions from scratch) was overstated: 25 of 28 anon-EXEC functions were already triaged by the completed predecessor SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001. Re-measuring at EXEC time cut the real deliverable from "author a second REVOKE migration duplicating the predecessor\'s authority over the same functions" down to "add 3 manifest entries", and avoided shipping a migration that would have re-claimed functions another SD already owned.',
    'A SECURITY sub-agent EXEC-phase manual read caught a real correctness bug: the DOWN migration\'s GRANT statement included PUBLIC alongside anon/authenticated, but the live pre-apply pg_default_acl catalog showed PUBLIC never had a default EXECUTE grant on this axis in the first place. Left as authored, the DOWN file would have left post-rollback state BROADER than the true pre-apply baseline (commit ea0855c0618, evidence 3bcccfb8-abf0-4a88-9751-c8e81e0bf120) — the same "rollback that over-grants" defect class as a prior, unrelated SD\'s rollback script.',
    'The SECURITY finding was fixed at the class level, not the instance level: PUBLIC was removed from the DOWN file\'s grant list AND a mechanical --hash mode was added to the acceptance script (fingerprinting pg_default_acl state before-UP / after-UP / after-DOWN), so a DOWN file that "looks like a plausible inverse but isn\'t" is now caught automatically on any future edit instead of depending on another manual SECURITY read.',
    'A VALIDATION sub-agent PLAN-verification pass (evidence 6876422e-e987-4e57-8783-012c9609c117) caught that the PRD\'s top-level acceptance_criteria, FR-3, FR-4, and risks[2] still described the ORIGINAL pre-EXEC-correction plan (a second UP/DOWN pair, a full 145-function manifest rewrite, a create/drop probe function) after the FR-2 rescope had been applied only to the FR-2 field itself. The correction had not propagated to every sibling field restating the same claim (fixed in commit 20288da8caf).',
    'Every learning cited here is independently traceable to a git commit and a sub_agent_execution_results evidence UUID — this is not narrative reconstruction after the fact.',
  ],

  what_needs_improvement: [
    'The original SD title/scope was authored assuming ALTER DEFAULT PRIVILEGES would close BOTH the future-function leak and the existing-function exposure in one mechanism. Root cause: the LEAD-phase proposal did not distinguish "change the default" from "change what already exists" as two independently-provable properties of a Postgres ACL system — it took a prospective TESTING review reading the actual DDL semantics before PRD authoring finished to surface the distinction, rather than catching it during LEAD scoping.',
    'The PRD\'s FR-2 scope (re-triage all 28/41/18 functions) was authored without first querying the live catalog to check whether a predecessor SD had already done that work. Root cause: LEAD-phase scoping trusted the SD\'s own premise text over a live measurement; 25/28 functions had already been triaged and the real gap was 3 functions, discovered only when EXEC ran its own full-surface census instead of inheriting the LEAD-phase count.',
    'The DOWN migration\'s GRANT statement was authored as a mechanical mirror of the UP migration\'s REVOKE statement (three grantees in, three grantees out) rather than being checked against the live pre-apply catalog. Root cause: "the DOWN file is the exact inverse of the UP file" is true syntactically but false semantically when one of the UP file\'s REVOKE targets (PUBLIC) was already a no-op — the DOWN file then re-grants something that was never held.',
    'A scope correction applied to FR-2 during EXEC did not propagate to the PRD\'s acceptance_criteria, FR-3, FR-4, and risks[2], which continued to describe the pre-correction plan until a VALIDATION pass caught it during PLAN verification, not during the EXEC-time correction itself. Root cause: the correction was made field-by-field rather than by searching the whole PRD document for every restatement of the corrected claim.',
    'The direct pooler DB connection (SUPABASE_POOLER_URL) was confirmed credential-broken in this session (and separately in a prior unrelated SD) — the working substitute, supabase.rpc(\'exec_sql\', {sql_text}), only accepts SINGLE-LINE SQL text; multi-line/indented SQL triggers a false 42501 rejection from the wrapper, which is a real wrapper quirk, not a genuine permissions error.',
    'CLAUDE_PLAN.md\'s "Testing Tier Strategy (Updated)" heading (leo_protocol_sections, generated ~line 756) is genuinely empty — zero body content — when TESTING went looking for a documented infra/security/no-UI E2E exemption for this pure-DB, zero-UI SD. No such exemption exists in writing anywhere in the protocol docs, even though DB-only SDs like this one clearly need one.',
  ],

  key_learnings: [
    'ALTER DEFAULT PRIVILEGES is FUTURE-SCOPED ONLY: it changes the ACL applied to functions created AFTER the ALTER runs, and does nothing to functions that already exist. "Fix the default" and "fix what already exists" are two independent mechanisms (REVOKE ... FROM role vs ALTER DEFAULT PRIVILEGES ... REVOKE ... FROM role) and each needs its own independent proof — an acceptance script that only verifies one axis can pass while the other axis is still wide open. This generalizes to every default-ACL / default-permission system, not just Postgres functions.',
    'PostgreSQL grants EXECUTE to anon/authenticated by ROLE NAME in pg_default_acl, not via a literal PUBLIC aclitem entry. A migration that only REVOKEs FROM PUBLIC is a structural no-op against this leak class — the predecessor SD\'s "REVOKE FROM PUBLIC" ADP proved this by measurement. Any future audit of default-privilege exposure must check per-role grantees, not just the PUBLIC pseudo-role.',
    'Re-measure scope at EXEC time against the LIVE system, never trust a LEAD-phase count carried forward unverified. The LEAD-phase premise (28/41/18 functions need re-triage) was overstated by 25/28 — a completed predecessor SD had already done that work. A live full-surface census at EXEC time is what caught this, and it changed the actual deliverable from a duplicate-authority migration to a 3-line manifest addition.',
    'A rollback (DOWN) file is not a syntactic mirror of the UP file — it must be checked against the live PRE-APPLY catalog, not derived by symmetry from the UP file\'s own REVOKE targets. When one of the UP file\'s REVOKE targets was already a no-op (PUBLIC never held the grant), mirroring it into a GRANT in DOWN created a rollback that leaves the system in a BROADER state than before the migration ever ran. Mechanical fingerprinting (hash of before-UP/after-UP/after-DOWN state) catches this defect class automatically; manual review alone is a single point of failure for it.',
    'A scope correction made to one field of a document must be checked against every OTHER field that restates the same claim, not assumed to be the only place it is said. This PRD\'s FR-2 rescope propagated to FR-2 but not to acceptance_criteria, FR-3, FR-4, or risks[2] — all of which independently described the pre-correction plan. This is a general PRD-editing discipline: grep the whole document for the corrected claim\'s language, don\'t trust that fixing the named field fixed the concept.',
    'The exec_sql RPC wrapper (supabase.rpc(\'exec_sql\', {sql_text})) rejects multi-line/indented SQL with a 42501 error that reads like a genuine permissions failure but is actually a wrapper parsing quirk — single-line SQL text is required. This is a workaround pattern worth knowing (and worth fixing at the wrapper level) whenever the direct pooler connection is unavailable.',
    'When a protocol doc heading exists but is genuinely empty (not missing — present with zero body content), that is a distinct failure mode from "the doc doesn\'t mention this at all". CLAUDE_PLAN.md\'s "Testing Tier Strategy (Updated)" heading existing-but-empty means a reader who searches for it finds the right place and still gets no answer, which is worse for discoverability than the section not existing.',
  ],

  success_patterns: [
    'Run a prospective sub-agent review on DDL semantics BEFORE PRD authoring finishes, not just at EXEC — catches mechanism-scope conflation while it is still cheap to fix',
    'Re-measure scope against the live system at EXEC time instead of carrying forward a LEAD-phase count unverified',
    'Fingerprint before/after/after-rollback state mechanically (--hash mode) so a DOWN-file defect class is caught by every future edit, not only by manual review',
    'When a scope correction lands on one field, search the whole document for every other restatement of the same claim',
  ],

  failure_patterns: [
    'SD title/scope conflated two independent ACL mechanisms (change-the-default vs change-what-exists) as if fixing one fixed both',
    'PRD FR authored from an SD premise text count rather than a live catalog query, overstating scope by 25/28 functions',
    'DOWN migration authored as a syntactic mirror of UP rather than checked against the live pre-apply catalog, producing a rollback that over-grants',
    'A field-level scope correction did not propagate to three other PRD fields restating the same corrected claim',
    'A documented protocol exemption (infra/security/no-UI E2E carve-out) does not exist even though the heading meant to hold it does',
  ],

  improvement_areas: [
    'LEAD-phase scoping for ACL/permission-system SDs: require an explicit statement of which mechanism(s) are being changed (future-default vs existing-grants) before PRD authoring, not discovered by a prospective sub-agent review after the fact',
    'PRD correction discipline: when a scope correction is applied mid-EXEC, grep the full PRD document for every field restating the corrected claim before treating the correction as complete',
    'Rollback (DOWN) migration authoring: require a live pre-apply catalog check as part of authoring, not only as part of review — the --hash mode added here is the mechanical version of this discipline and should be the default pattern for future chairman-gated migrations',
  ],

  action_items: [
    {
      action: 'File a harness ticket to fix the exec_sql RPC wrapper\'s false 42501 rejection of multi-line/indented SQL text — the wrapper should either accept multi-line SQL or document the single-line requirement at the call site, since the current failure mode is indistinguishable from a genuine permissions error.',
      owner: 'EXEC Implementation Agent',
      deadline: 'Next harness campaign session',
      success_criteria: 'A multi-line SQL string passed to supabase.rpc(\'exec_sql\', {sql_text}) either succeeds or fails with an error message that does not read as 42501/permissions-denied',
      priority: 'medium',
      smart_format: true,
      source: 'pooler_broken_wrapper_quirk',
    },
    {
      action: 'Populate CLAUDE_PLAN.md\'s empty "Testing Tier Strategy (Updated)" heading (leo_protocol_sections, ~line 756) with an explicit infra/security/no-UI E2E exemption carve-out, so pure-DB / zero-UI SDs like this one have a documented answer instead of an empty section a reader can find but not use.',
      owner: 'PLAN Verification Agent',
      deadline: 'Next protocol-doc maintenance pass',
      success_criteria: 'leo_protocol_sections row for "Testing Tier Strategy (Updated)" has non-empty body content stating the infra/security/no-UI E2E exemption; feedback row f61c145e-78b9-41ee-9a5e-b61c58c1d519 marked resolved',
      priority: 'high',
      smart_format: true,
      source: 'empty_heading_found_by_TESTING',
    },
    {
      action: 'Add a standing PRD-editing check: whenever a scope correction is applied to one FR/field mid-EXEC, run a full-document search for every other field restating the corrected claim before treating the correction as propagated (this SD\'s own PRD needed a second, VALIDATION-caught correction for exactly this gap).',
      owner: 'EXEC Implementation Agent',
      deadline: 'Standing practice from the next SD with a mid-EXEC scope correction',
      success_criteria: 'A mid-EXEC PRD correction commit includes a note confirming a full-document grep for the corrected claim\'s language, not just the named field',
      priority: 'high',
      smart_format: true,
      source: 'validation_finding_prd_correction_gap',
    },
    {
      action: 'Adopt the --hash fingerprint pattern (before-UP / after-UP / after-DOWN state capture) as the default acceptance-script shape for future chairman-gated migrations, not just this one, so a DOWN file that mirrors UP syntactically but not semantically is caught mechanically instead of depending on a SECURITY sub-agent catching it by manual read each time.',
      owner: 'DATABASE Sub-Agent',
      deadline: 'Next chairman-gated migration SD',
      success_criteria: 'A new chairman-gated migration\'s acceptance script includes a --hash mode fingerprinting pre-UP/post-UP/post-DOWN state, following the pattern in database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs',
      priority: 'medium',
      smart_format: true,
      source: 'security_finding_down_migration_over_grant',
    },
  ],

  protocol_improvements: [
    {
      category: 'TESTING_STRATEGY',
      improvement: 'Run a prospective sub-agent DDL/mechanism review during PLAN, before PRD authoring is finished, for any SD touching database ACL/permission systems.',
      evidence: `${SD_KEY}: a prospective TESTING review caught that ALTER DEFAULT PRIVILEGES is future-scoped only and reshaped the acceptance script's entire two-axis design before the PRD was fully written.`,
      impact: 'Catches mechanism-scope conflation while it is cheap to fix, instead of after a migration is authored around the wrong assumption',
      affected_phase: 'PLAN',
    },
    {
      category: 'PROCESS_IMPROVEMENT',
      improvement: 'Require a live catalog/system census at EXEC time for any SD whose scope was estimated at LEAD from a count carried forward in the SD premise text, rather than trusting the premise count.',
      evidence: `${SD_KEY}: a live full-surface census found the LEAD-phase FR-2 scope (28 functions to re-triage) was overstated by 25/28 -- a predecessor SD had already triaged them, and the real gap was 3 functions.`,
      impact: 'Prevents authoring duplicate-authority migrations over the same objects a predecessor SD already staged',
      affected_phase: 'EXEC',
    },
    {
      category: 'DOCUMENTATION',
      improvement: 'CLAUDE_PLAN.md needs a populated "Testing Tier Strategy (Updated)" section documenting an infra/security/no-UI E2E exemption -- it currently exists as a heading with zero body content.',
      evidence: `${SD_KEY}: TESTING went looking for this exemption for a pure-DB, zero-UI SD and found the heading empty; logged as feedback row f61c145e-78b9-41ee-9a5e-b61c58c1d519.`,
      impact: 'Removes a discoverability trap where a reader finds the right section and still gets no answer',
      affected_phase: 'PLAN',
    },
    {
      category: 'PROCESS_IMPROVEMENT',
      improvement: 'A scope correction applied to one PRD field mid-EXEC must be accompanied by a full-document search for every other field restating the same corrected claim.',
      evidence: `${SD_KEY}: the FR-2 rescope was applied to FR-2 but not to acceptance_criteria, FR-3, FR-4, or risks[2], all of which still described the pre-correction plan until a VALIDATION pass caught it.`,
      impact: 'Prevents a PLAN-verification gate catch of a correction gap that EXEC should have closed itself',
      affected_phase: 'EXEC',
    },
  ],

  quality_score: 88,
  team_satisfaction: 8,
  business_value_delivered: 85,
  velocity_achieved: 100,
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 3,
  bugs_resolved: 3,
  tests_added: 1,
  customer_impact: 'Security posture: closes the future-function half of an anon/authenticated EXECUTE-by-default leak on a chairman-gated (not-yet-applied) migration; zero end-user-facing surface (pure DB, zero UI).',
  performance_impact: 'None measured — DDL-only change to default ACLs, no runtime query path affected.',
  affected_components: [
    'database/chairman-gated/20260816_defacl_anon_auth_axis.sql',
    'database/chairman-gated/20260816_defacl_anon_auth_axis_DOWN.sql',
    'database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs',
    'scripts/audit-rpc-execute-grants-buckets.json',
  ],
  related_files: [
    'database/chairman-gated/20260816_defacl_anon_auth_axis.sql',
    'database/chairman-gated/20260816_defacl_anon_auth_axis_DOWN.sql',
    'database/chairman-gated/20260816_defacl_anon_auth_axis_acceptance.mjs',
    'database/chairman-gated/README.md',
    'scripts/audit-rpc-execute-grants-buckets.json',
    '.artifacts/defacl-anon-auth-axis-baseline.json',
    '.artifacts/defacl-full-census.json',
    'scripts/one-off/insert-prd-defacl-anon-auth-axis-001.mjs',
    'scripts/one-off/exec-correct-fr2-scope-defacl-anon-auth-axis-001.mjs',
    'scripts/one-off/plan-correct-prd-text-defacl-anon-auth-axis-001.mjs',
    'scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs',
  ],
  related_commits: [
    '435854e97b2', // feat(SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001): extend the grant verifier to the anon/PUBLIC axis (FR-5)
    'f6b98d31317', // feat(SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001): stage per-role defacl REVOKE + close 3-fn manifest gap
    '97fd42716a5', // fix(SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001): stamp real timestamp in baseline output, record E2E-N/A justification
    'ea0855c0618', // fix(SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001): DOWN file must not re-grant PUBLIC (SECURITY finding)
    '20288da8caf', // docs(SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001): correct PRD text to match delivered scope (VALIDATION finding)
  ],
  related_prs: [],
  tags: ['security', 'database', 'default-privileges', 'rls-adjacent', 'chairman-gated', 'rollback-correctness'],
};

// Preflight (matches the pattern established in scripts/one-off/insert-retro-scheduled-worktree-reaper-001.mjs)
const { data: sample, error: sampleErr } = await supabase
  .from('retrospectives')
  .select('generated_by,status,retro_type,team_satisfaction')
  .limit(500);
if (sampleErr) {
  console.error('PREFLIGHT FAILED (could not sample live rows):', sampleErr.message);
  process.exit(1);
}
const distinct = (k) => new Set(sample.map((r) => r[k]).filter((v) => v !== null));
const problems = [];
for (const f of ['sd_id', 'title', 'retro_type', 'conducted_date', 'generated_by', 'status', 'what_went_well', 'what_needs_improvement', 'key_learnings']) {
  if (!retrospective[f]) problems.push(`required field missing: ${f}`);
}
for (const f of ['generated_by', 'status', 'retro_type']) {
  if (!distinct(f).has(retrospective[f])) problems.push(`${f}='${retrospective[f]}' not observed in live rows (${[...distinct(f)].join(', ')})`);
}
if (retrospective.team_satisfaction < 1 || retrospective.team_satisfaction > 10) problems.push('team_satisfaction outside 1..10');
for (const f of ['objectives_met', 'on_schedule', 'within_scope', 'auto_generated', 'technical_debt_addressed', 'technical_debt_created']) {
  if (typeof retrospective[f] !== 'boolean') problems.push(`${f} must be boolean`);
}
for (const f of ['quality_score', 'team_satisfaction', 'business_value_delivered', 'velocity_achieved', 'bugs_found', 'bugs_resolved', 'tests_added']) {
  if (typeof retrospective[f] !== 'number') problems.push(`${f} must be number`);
}
for (const f of ['what_went_well', 'what_needs_improvement', 'key_learnings', 'success_patterns', 'failure_patterns', 'improvement_areas']) {
  (retrospective[f] || []).forEach((s, i) => {
    if (typeof s !== 'string' || s.trim().length < 20) problems.push(`${f}[${i}] is empty or too short to be a real entry`);
  });
}
retrospective.action_items.forEach((a, i) => {
  if (!a || typeof a.action !== 'string' || a.action.trim().length < 20) problems.push(`action_items[${i}] has no usable action text`);
  if (!a?.owner) problems.push(`action_items[${i}] has no owner`);
});
retrospective.protocol_improvements.forEach((p, i) => {
  if (!p?.improvement || !p?.category) problems.push(`protocol_improvements[${i}] missing category/improvement`);
});

if (problems.length > 0) {
  console.error('PREFLIGHT FAILED:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}
console.log(`Preflight passed (learnings=${retrospective.key_learnings.length}, went_well=${retrospective.what_went_well.length}, needs_improvement=${retrospective.what_needs_improvement.length}, actions=${retrospective.action_items.length})`);

if (process.argv.includes('--dry-run')) {
  console.log('DRY RUN - not stored.');
  process.exit(0);
}

const stored = await storeRetrospective(supabase, retrospective);
if (!stored.success) {
  console.error('STORE FAILED:', stored.error);
  process.exit(1);
}
console.log('STORED retrospective id:', stored.id);
