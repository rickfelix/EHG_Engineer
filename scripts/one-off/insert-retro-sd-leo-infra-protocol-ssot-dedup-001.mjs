/**
 * SD-COMPLETION retrospective writer for SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001.
 *
 * Uses the CANONICAL writer (lib/sub-agents/retro/db-operations.js storeRetrospective).
 * No hand-rolled INSERT. Pattern mirrors
 * scripts/one-off/insert-retro-sd-leo-infra-protocol-governance-package-001.mjs.
 *
 * A fresh insert (not enhancement of the existing row) is REQUIRED: the only other
 * retrospectives row for this SD (c502fe40-eee1-46b2-927f-d6870df03c89) is retro_type='HANDOFF' /
 * retrospective_type='LEAD_TO_PLAN', created_at=2026-08-24T08:10:02.71571+00:00 — before the
 * RETROSPECTIVE_QUALITY_GATE's stated cutoff (2026-08-24T08:10:03.250Z, the LEAD-TO-PLAN
 * acceptance timestamp). getFilteredRetrospective requires retro_type='SD_COMPLETION' AND
 * created_at after that acceptance timestamp, so the HANDOFF row can never satisfy the gate
 * regardless of content.
 */
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { storeRetrospective } from '../../lib/sub-agents/retro/db-operations.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = 'f7792a58-57af-436d-8cc3-c1369dd8cff0';
const SD_KEY = 'SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001';

const retrospective = {
  sd_id: SD_UUID,
  project_name: SD_KEY,
  target_application: 'EHG_Engineer',
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  title: `${SD_KEY} Retrospective — a false premise corrected twice at LEAD, an irreversible-mutation risk caught before it shipped, and a fix that looked done but wasn't`,
  description:
    'This SD was commissioned from an architecture-eval follow-on ("Protocol SSOT dedup + publication audit") '
    + 'whose originating claims turned out to be substantially overstated. A LEAD-phase Explore-agent live probe '
    + 'found the claimed "Phase-Transition rule renders differently across CLAUDE_CORE/LEAD/PLAN/EXEC" was in '
    + 'fact dead, never-rendering rows; the claimed "10.7KB dark AUTO-PROCEED spec" was already cited-retired; '
    + 'and the claimed "no publication audit exists" was outright false — a publication audit already existed '
    + 'from a completed sibling SD, just uncommitted-to-CI and failing live with 22 unclassified sections. LEAD '
    + 'rescoped rather than escalated, since the underlying dedup/audit work still had real value against the '
    + 'measured reality. A second LEAD-phase correction followed when validation/risk sub-agents found the '
    + 'corrected plan itself unsafe as scoped: FR-4 was blocked by construction (chairman_ratifications does '
    + 'not exist live), the planned row-DELETE was irreversible on a table with no history/FK, the mutation '
    + 'would redden a currently-green required CI check without an atomic manifest commit, the "canonical" row '
    + '(307) itself carried a known-superseded claim that must not be propagated, the publication audit\'s gap '
    + 'was structural (re-breaks on every SD completion) not a one-time backfill, and 2 more duplicate-content '
    + 'families existed beyond the plan\'s own scope — one of which ({544,545}, same section_type) proved a '
    + 'naive uniqueness constraint insufficient. The 4 FRs that shipped after both corrections were snapshot-'
    + 'gated UPDATE-only reconciliation of 3 duplicate families, a ledger-shaped dedup_decisions record in SD '
    + 'metadata standing in for the not-yet-live chairman_ratifications table, a fix to the publication audit\'s '
    + 'write-side gap plus backfill plus content-hash-keyed uniqueness check plus advisory-only CI wiring. Two '
    + 'further rounds of EXEC-phase and PLAN_VERIFICATION sub-agent findings then caught a stale lint exemption '
    + 'whose first fix attempt did not actually work, a log-injection hardening gap, and missing write-path test '
    + 'coverage.',
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['EXPLORE', 'VALIDATION', 'RISK', 'TESTING', 'SECURITY'],
  human_participants: ['LEAD'],

  what_went_well: [
    {
      achievement:
        'LEAD-phase premise correction #1: a live Explore-agent measurement, not a re-read of the architecture '
        + 'eval\'s own prose, disproved all three of its headline claims before any PRD was written against them '
        + '— the "renders differently" Phase-Transition rule was dead/never-rendering, the "dark" AUTO-PROCEED '
        + 'spec was already cited-retired (row 416 -> row 567), and the "no publication audit exists" claim was '
        + 'flatly false (protocol-publication-audit.cjs already existed from SD-LEO-INFRA-PROTOCOL-PUBLICATION-'
        + 'PIPELINE-001, just uncommitted-to-CI and failing live). LEAD treated this as a scope-correction, not '
        + 'an escalation, since the underlying dedup/audit work retained real value once rescoped to what was '
        + 'actually measured.',
      is_boilerplate: false
    },
    {
      achievement:
        'LEAD-phase premise correction #2: validation-agent + risk-agent review of the CORRECTED scope still '
        + 'found it unsafe as planned — FR-4 blocked by construction (chairman_ratifications does not exist '
        + 'live, confirmed via to_regclass returning NULL), the planned row-DELETE irreversible on a table with '
        + 'no history table and no FK, the mutation would redden a currently-green required CI check without an '
        + 'atomic manifest commit, and 2 additional duplicate-content families existed beyond the plan\'s own '
        + 'scope. Both corrections happened before EXEC wrote a line of mutation code, at the cost of the '
        + 'cheapest possible failure mode (a second LEAD-phase re-scope) rather than the most expensive one (an '
        + 'irreversible DELETE against a governance-critical table in production).',
      is_boilerplate: false
    },
    {
      achievement:
        'FR-1\'s mutation design was modeled on an already-proven pattern (scripts/protocol/adam-contract-'
        + 'land.mjs\'s snapshot-refuse pattern) rather than invented fresh, and a live trigger probe confirmed '
        + 'the doctrine-of-constraint trigger blocks UPDATE only when app.current_actor_role=\'EXEC\' is '
        + 'explicitly set (unset/LEAD/PLAN all pass, and supabase-js never sets this GUC by default) — turning '
        + 'a plausible self-block risk into a verified, avoidable one before the mutation ran.',
      is_boilerplate: false
    },
    {
      achievement:
        'The row-307 content-quality defect (a known-superseded bypass-quota claim: 3-per-SD-max/10-per-day-'
        + 'global, corrected by build-vs-run deep-dive D9 to no-per-SD-cap/2000-per-day-global) was caught '
        + 'BEFORE reconciliation and deliberately NOT propagated into rows 308-310 during dedup — the family was '
        + 'reconciled toward a neutral archived-duplicate state instead of a literal copy of row 307\'s current, '
        + 'partially-wrong text. Fixing a dedup defect by copying more of the same defect into more rows would '
        + 'have been the exact failure class this SD exists to close.',

      is_boilerplate: false
    },
    {
      achievement:
        'The {544,545} same-section_type duplicate pair was used as the specific proof case for FR-3\'s new '
        + 'content-hash-keyed uniqueness check, deliberately choosing a shape (identical section_type) the DB\'s '
        + 'existing uniqueness constraint and the archived anchor_topic-keyed LINT-ANCHOR-001 rule both could not '
        + 'catch — the new check was proven against the exact case that motivated it, not a synthetic stand-in.',
      is_boilerplate: false
    }
  ],

  what_needs_improvement: [
    'A first attempted fix for the stale count-truncation-lint exemption (wrapping the read in '
      + 'warnIfCapTruncated() as a separate statement after the .select() call) looked plausible and matched '
      + 'the general shape of the fix, but did NOT actually clear the lint\'s blocking check — it took two '
      + 'independent sub-agents live-replaying the lint\'s exact chainWindow() scan logic to prove the real fix '
      + 'needed .limit(999) applied directly on the select chain itself, not a downstream wrapper call.',
    'The diff-lint\'s own printed error message advertises an overrides.json escape hatch, but that override '
      + 'entry is consulted only by the separate, advisory buildInventory()/count-truncation-inventory.mjs path '
      + '— never by the diff-lint\'s own scanFile(), which is the path that actually blocks. A user following the '
      + 'lint\'s own guidance would edit the wrong file and see no change in the blocking verdict.',
    'The originating architecture-eval document made three specific, falsifiable claims (a live rendering '
      + 'divergence, a dark spec, and a missing audit) and all three were wrong on live measurement — the '
      + 'document itself was treated as sufficiently authoritative to commission an SD without a Explore-agent '
      + 'check happening earlier, at the eval\'s authoring time rather than at this SD\'s LEAD phase.',
    'FR-4\'s original scope (write to chairman_ratifications) was carried into the PRD despite the table not '
      + 'existing live — a to_regclass check against the target table before scoping an FR that writes to it '
      + 'would have caught this before validation/risk sub-agents had to catch it downstream.'
  ],

  action_items: [
    {
      owner: 'PLAN',
      action:
        'Open a follow-up SD/QF to fix protocol-publication-audit.cjs\'s isDark classifier blind spot: it trusts '
        + 'a non-null target_file as proof a row renders, but the generator never actually reads that column for '
        + 'routing. 26 of 269 file-status rows are unmapped with a stale truthy target_file, invisible to the '
        + 'dark-section check — including rows 449 and 544, the exact rows this SD\'s own FR-1 selected as '
        + 'canonical, which never actually render in any CLAUDE_*.md. This is a materially larger, pre-existing '
        + 'defect in the audit\'s own classifier that FR-3c\'s content-hash uniqueness check cannot see or fix, '
        + 'since it layers on the same isDark logic.',
      category: 'backlog',
      sd_reference: SD_KEY,
      is_boilerplate: false
    },
    {
      owner: 'PLAN',
      action:
        'Route the 2 remaining leo_protocol_sections writers still missing publication_status metadata — '
        + 'scripts/protocol/adam-contract-land.mjs:435 (documented dry-run, not yet armed) and '
        + 'scripts/protocol/coordinator-contract-land.mjs (4 insert sites, no metadata classification at all) — '
        + 'through the same fix FR-3a applied to improvement-appliers.js\'s 3 insert sites. This is the same '
        + '"N remaining bypass sites" pattern the prior sibling SD (SD-LEO-INFRA-PROTOCOL-GOVERNANCE-PACKAGE-001) '
        + 'found and deferred for its own sanitizer; consistent discipline here is to name it as a follow-up '
        + 'rather than silently expand this SD\'s already-large FR-3 scope.',
      category: 'backlog',
      sd_reference: SD_KEY,
      is_boilerplate: false
    },
    {
      owner: 'EXEC',
      action:
        'File a general harness-backlog fix for count-truncation-diff-lint.mjs: its printed error message tells '
        + 'users to add an overrides.json entry, but that entry has zero effect on the diff-lint\'s own blocking '
        + 'verdict (only warnIfCapTruncated()-wrapped reads or .limit()-bounded select chains clear it; the '
        + 'override is read only by the separate advisory inventory path). Either make the lint\'s error message '
        + 'accurate about which mechanism actually clears it, or make the override path consulted by scanFile() '
        + 'too, so the documented escape hatch and the enforced behavior match.',
      category: 'process-improvement',
      sd_reference: SD_KEY,
      is_boilerplate: false
    },
    {
      owner: 'EXEC',
      action:
        'When a lint/gate\'s blocking check is fixed by wrapping a call in a helper function, add a regression '
        + 'test (or a live re-run of the lint\'s own scan logic against the fixed file) that proves the specific '
        + 'blocking check now passes, rather than relying on the fix "looking like" the documented pattern — '
        + 'this SD\'s first attempt at the count-truncation fix matched the general shape of prior fixes but '
        + 'still failed the lint\'s actual chainWindow() scan, and was only caught because two independent sub-'
        + 'agents replayed that scan logic live rather than trusting the fix\'s plausibility.',
      category: 'prevention',
      sd_reference: SD_KEY,
      is_boilerplate: false
    }
  ],

  key_learnings: [
    {
      learning:
        'An architecture-eval document\'s claims are not self-verifying just because they read as specific and '
        + 'confident — this SD\'s originating eval named a live rendering divergence, a dark spec, and a missing '
        + 'audit, and a single round of live Explore-agent measurement against the actual DB/generator/CI state '
        + 'disproved all three. The eval was not malicious or careless in an obvious way; it was simply wrong '
        + 'about live state that had moved (a sibling SD had already built the "missing" audit) or had never '
        + 'been true (the "renders differently" rule was dead, never-rendering DB rows).',
      is_boilerplate: false
    },
    {
      learning:
        'Rescoping at LEAD twice, in response to two different classes of sub-agent finding (Explore-measured '
        + 'premise falsity, then validation/risk-measured implementation-safety gaps), is a materially different '
        + 'and healthier outcome than either shipping the original overstated premise or escalating/abandoning '
        + 'the SD. Both corrections were transparent, evidence-cited, and preserved the underlying work\'s real '
        + 'value (dedup + audit-fix) rather than discarding it.',
      is_boilerplate: false
    },
    {
      learning:
        'A governance-critical table with no created_at/updated_at and no history/FK structure cannot support a '
        + 'DELETE-based cleanup safely — the only reversible primitive available was snapshot-then-UPDATE with a '
        + 're-verify-immediately-before-mutating step (since a snapshot taken once at the start cannot detect a '
        + 'concurrent write by timestamp on a table with no timestamp columns). This constraint was discovered '
        + 'by risk-agent review of the planned DELETE, not by the original FR draft.',
      is_boilerplate: false
    },
    {
      learning:
        'The doctrine-of-constraint trigger\'s blocking condition is exact and narrow: it fires on UPDATE only '
        + 'when app.current_actor_role=\'EXEC\' is explicitly set as a session GUC, and supabase-js never sets '
        + 'this by default. A mutation script can self-block only by explicitly opting into that GUC — this was '
        + 'confirmed by a live trigger probe rather than by reading the trigger\'s SQL definition alone, since '
        + 'the practical question (does supabase-js ever set this) is not answerable from the trigger source.',
      is_boilerplate: false
    },
    {
      learning:
        'Same-section_type duplicate content ({544,545}, both handoff_precheck) is a real, live class of '
        + 'duplicate that a naive section_type-scoped uniqueness constraint cannot catch, because both rows '
        + 'legitimately share that type — the fix required a content-hash-keyed check (md5 of normalized '
        + 'content) instead, and was proven specifically against this pair rather than a synthetic case, since '
        + 'the archived anchor_topic-keyed LINT-ANCHOR-001 rule would not have caught it either (anchor_topic is '
        + 'NULL on all 3 of this SD\'s target families).',
      is_boilerplate: false
    },
    {
      learning:
        'A fix that looks structurally correct can still fail the exact check it targets: wrapping the '
        + 'leo_protocol_sections read in warnIfCapTruncated() as a trailing statement after the .select() call '
        + 'matched the general pattern used elsewhere in the codebase, but count-truncation-diff-lint.mjs\'s '
        + 'chainWindow() scan looks for a bound (like .limit()) directly on the select chain itself — a call '
        + 'issued afterward, even one that logs a warning about truncation, is invisible to that scan. Two '
        + 'independent sub-agents had to live-replay the lint\'s exact scan logic against the file to prove the '
        + 'first fix attempt was cosmetically correct but functionally inert; the working fix was .limit(999) '
        + 'applied directly on the chain.',
      is_boilerplate: false
    },
    {
      learning:
        'The count-truncation-diff-lint\'s own error message names a remediation path (add an overrides.json '
        + 'entry) that has zero effect on its actual blocking verdict — the override is read only by a separate, '
        + 'advisory buildInventory()/count-truncation-inventory.mjs path, never by the diff-lint\'s own '
        + 'scanFile(). A tool\'s self-reported remediation guidance is not evidence that the guidance is correct; '
        + 'it has to be checked against which code path the guidance actually reaches.',
      is_boilerplate: false
    },
    {
      learning:
        'protocol-publication-audit.cjs\'s write-side gap (nothing sets metadata.publication_status on any '
        + 'INSERT to leo_protocol_sections) is structural, not a one-time data-quality issue — since the /learn '
        + 'applier runs on every SD completion fleet-wide, a backfill-only fix would have re-broken on the very '
        + 'next SD completion, potentially during this SD\'s own EXEC window. The required sequence (fix the '
        + 'write path first, then backfill, then add the new uniqueness check) exists specifically to avoid that '
        + 'race, and the audit was wired into CI as advisory-only rather than required, since the fix+backfill '
        + 'race could otherwise redden a concurrent session\'s PR before the fix proved itself over a full cycle.',
      is_boilerplate: false
    }
  ],

  quality_score: 90,
  team_satisfaction: 8,
  business_value_delivered:
    'Reconciles 3 duplicate/diverged row families in leo_protocol_sections via a reversible, snapshot-gated '
    + 'UPDATE-only process (zero DELETEs) on a governance-critical table with no history/FK safety net; records '
    + 'a ledger-shaped dedup_decisions structure in SD metadata that a future migration can insert verbatim into '
    + 'chairman_ratifications once it exists live; fixes protocol-publication-audit.cjs\'s structural write-side '
    + 'gap (previously re-breaking on every SD completion), backfills its 22 unclassified rows, adds a content-'
    + 'hash-keyed uniqueness check proven against a same-section_type duplicate case a naive constraint could '
    + 'not catch, and wires the audit into CI as advisory-first. Corrects an architecture-eval document\'s three '
    + 'overstated headline claims with live measurement before any of them could propagate into a bigger, wrongly '
    + 'scoped mutation.',
  customer_impact: 'Internal protocol-governance/tooling improvement — no end-user-facing surface.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 5,
  bugs_resolved: 3,
  tests_added: 3,
  performance_impact: 'No runtime performance impact — all mutations are one-time reconciliation scripts and a '
    + 'CI-only advisory audit workflow; no change to any request-path code.',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,

  success_patterns: [
    'Running a live Explore-agent measurement against DB/generator/CI state to test an architecture-eval '
      + 'document\'s specific claims BEFORE committing a PRD to them, rather than treating the eval\'s prose as '
      + 'authoritative.',
    'Rescoping at LEAD (twice, for two different classes of finding) rather than either shipping an overstated '
      + 'premise or escalating/abandoning work that still had real underlying value.',
    'Modeling a new mutation script\'s safety pattern on an already-proven precedent (adam-contract-land.mjs\'s '
      + 'snapshot-refuse pattern) rather than inventing a new one for a governance-critical, no-history-table.',
    'Proving a new uniqueness check specifically against the live case that motivated it ({544,545}) rather than '
      + 'a synthetic stand-in, and confirming a trigger\'s exact blocking condition with a live probe rather than '
      + 'a source read alone.',
    'Live-replaying a lint\'s exact scan logic against a fix attempt before declaring it resolved, which is what '
      + 'caught the count-truncation fix that looked correct but was not.'
  ],
  failure_patterns: [
    'The originating architecture-eval document\'s three headline claims (live rendering divergence, dark spec, '
      + 'missing audit) were all wrong on live measurement, and were not checked before this SD was commissioned '
      + 'against them.',
    'FR-4\'s original scope assumed chairman_ratifications existed as a live table without a to_regclass check '
      + 'first; validation/risk sub-agents had to catch this after the PRD had already been drafted around it.',
    'A first fix attempt for the stale count-truncation-lint exemption (warnIfCapTruncated() as a trailing '
      + 'statement) matched the general shape of the correct fix but did not actually clear the lint\'s blocking '
      + 'check, and was only caught by two independent sub-agents live-replaying the lint\'s own scan logic.',
    'The count-truncation-diff-lint\'s own error message advertises an overrides.json remediation path that has '
      + 'no effect on its actual blocking verdict — a documentation-vs-behavior mismatch in the harness itself, '
      + 'not something this SD introduced but something it had to work around.'
  ],
  improvement_areas: [
    {
      area: 'An architecture-eval document\'s specific, falsifiable claims were not live-verified before this SD '
        + 'was commissioned to act on them.',
      analysis:
        'All three headline claims (rendering divergence, dark spec, missing audit) were wrong on live '
        + 'measurement — one was dead/never-rendering rows, one was already cited-retired, and one was outright '
        + 'false (the audit already existed from a completed sibling SD). The eval read as specific and '
        + 'confident, which made it plausible without independent verification.',
      prevention:
        'When an architecture-eval or research document names a specific defect against live system state '
        + '(a rendering bug, a missing artifact, a stale spec), require a live probe against the actual DB/CI/'
        + 'generator confirming the claim before a PRD is drafted around it as fact, not just before EXEC begins '
        + 'implementing it.'
    },
    {
      area: 'A first fix attempt for a stale lint exemption looked structurally correct but did not clear the '
        + 'lint\'s actual blocking check.',
      analysis:
        'Wrapping the flagged read in warnIfCapTruncated() as a trailing statement matched the pattern used '
        + 'elsewhere for this class of fix, but the diff-lint\'s chainWindow() scan looks specifically for a '
        + 'bound like .limit() directly on the select chain — a downstream wrapper call is invisible to that '
        + 'scan regardless of whether it also logs a truncation warning.',
      prevention:
        'When fixing a lint/gate failure by wrapping a flagged call in a helper function, live-replay the lint\'s '
        + 'own scan/check logic against the fixed file (not just re-running the lint as a black box, if that is '
        + 'feasible) before declaring the fix complete — a fix that "looks like" prior fixes for the same lint is '
        + 'not evidence it satisfies that lint\'s specific detection logic.'
    }
  ],

  generated_by: 'MANUAL',
  trigger_event: 'SD_STATUS_COMPLETED',
  status: 'PUBLISHED',
  learning_category: 'DATABASE_SCHEMA',
  applies_to_all_apps: false,
  related_files: [
    'scripts/one-off/ssot-dedup-reconcile-001.mjs',
    'scripts/one-off/ssot-dedup-fix-family1-uniqueness-001.mjs',
    'scripts/one-off/ssot-dedup-pub-audit-backfill-001.mjs',
    'scripts/protocol-publication-audit.cjs',
    'scripts/modules/learning/improvement-appliers.js',
    'scripts/modules/claude-md-generator/index.js',
    'scripts/protocol/adam-contract-land.mjs',
    'scripts/protocol/coordinator-contract-land.mjs',
    'scripts/count-truncation-diff-lint.mjs',
    'lib/db/fetch-all-paginated.mjs',
    '.github/workflows/protocol-publication-audit.yml',
    'database/chairman-gated/20260823_chairman_ratifications.sql'
  ],
  related_commits: [],
  related_prs: [],
  affected_components: [
    'leo_protocol_sections',
    'protocol-publication-audit.cjs',
    '/learn applier (scripts/modules/learning)',
    'count-truncation-diff-lint.mjs',
    'strategic_directives_v2.metadata (dedup_decisions ledger placeholder)'
  ],
  tags: [
    'protocol-governance',
    'ssot-dedup',
    'publication-audit',
    'lead-scope-correction',
    'irreversible-mutation-risk',
    'false-fix',
    SD_KEY
  ]
};

async function main() {
  const supabase = await createSupabaseServiceClient();

  const { data: existing } = await supabase
    .from('retrospectives')
    .select('id, retro_type, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`⚠️  SD_COMPLETION retrospective already exists (id=${existing[0].id}, created_at=${existing[0].created_at}) — refusing to insert a duplicate.`);
    process.exit(0);
  }

  const result = await storeRetrospective(supabase, retrospective);

  if (!result.success) {
    console.error('❌ Insert failed:', result.error);
    process.exit(1);
  }

  console.log(`✅ Retrospective inserted: id=${result.id}`);

  const { data: verify } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, created_at, quality_score, status')
    .eq('id', result.id)
    .single();
  console.log('Verify row:', JSON.stringify(verify, null, 2));
}

if (isMainModule(import.meta.url)) main();
