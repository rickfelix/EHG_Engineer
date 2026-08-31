import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-PHASE-DESIGN-OKR-001';

const { data: sd, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, target_application')
  .eq('sd_key', SD_KEY)
  .single();
if (error) throw error;
console.log(`Resolved sd_id=${sd.id} from sd_key=${sd.sd_key}`);

const results = {
  verdict: 'PASS',
  confidence_score: 96,
  summary:
    'Phase-0 DESIGN-ONLY deliverable. No secrets/PII/connection strings in the committed doc; ' +
    'branch touches zero production code; documenting the SDNextSelector scoring divergence carries ' +
    'no disclosure risk; proposed remediations suggest no insecure pattern.',
  detailed_analysis: [
    '1. SECRET/PII SCAN — docs/design/okr-driven-prioritization-day28-design.md (179 lines) read in full.',
    '   Regex sweep for JWTs (eyJ...), sk-/ghp_/github_pat_ tokens, postgres:// DSNs, *.supabase.co',
    '   project URLs, password/secret/api_key assignments, and bearer tokens: ZERO matches in the doc.',
    '   Zero email addresses / PII. Identifiers present are internal, non-sensitive: table names',
    '   (objectives, key_results, sd_key_result_alignment), KR labels (KR-2026-02-01, KR-GOV-3.3),',
    '   repo-relative script paths, and a package.json line number. None are credentials or endpoints.',
    '   No internal URLs, hostnames, IPs, or connection strings of any kind.',
    '',
    '2. SCOPE — production code untouched. HEAD~3..HEAD crosses a merge commit (a5860f8f4c3) and',
    '   therefore mixes in another SD\'s files; the correct scope is merge-base(origin/main)..HEAD,',
    '   which yields exactly 4 files, all belonging to this SD:',
    '     docs/design/okr-driven-prioritization-day28-design.md   (+179, the deliverable)',
    '     scripts/one-off/lead-enrich-phase-design-okr-001.mjs    (+50, LEAD evidence)',
    '     scripts/one-off/store-explore-evidence-phase-design-okr-001.mjs (+49, EXPLORE evidence)',
    '     scripts/one-off/store-exec-testing-evidence-phase-design-okr-001.mjs (+46, TESTING evidence)',
    '   Design doc + this SD\'s own scripts/one-off/*.mjs only. The three files the doc analyzes',
    '   (scripts/lib/priority-scorer.js, scripts/modules/sd-next/SDNextSelector.js,',
    '   scripts/okr-priority-sync.js) are NOT in the diff — consistent with the doc\'s own',
    '   "Out of scope" section. Design-only claim VERIFIED.',
    '',
    '3. DISCLOSURE RISK OF THE DOCUMENTED DEFECT — NONE. Confirmed explicitly.',
    '   The SDNextSelector.js:35-48 divergence is an internal-tooling work-prioritization ranking bug:',
    '   a 4-key inline KR_URGENCY table shadowing priority-scorer.js\'s 7-key table, so a',
    '   status=\'missed\' KR scores 1.0x instead of 0.0x. Threat-model review finds no security angle:',
    '     - No authentication/authorization surface (no auth check, session, token, or role logic).',
    '     - No data exposure (the scorer reads KR status values already visible to any operator;',
    '       it emits no data to an untrusted sink).',
    '     - No injection vector (a static object literal keyed by an enum-ish status string with a',
    '       nullish fallback; no query construction, no eval, no deserialization).',
    '     - Not attacker-controllable: key_results.status is set through governed internal workflows,',
    '       not user input, and both repo and doc are internal.',
    '   Worst case impact is mis-ordered internal work queues — an availability/correctness concern for',
    '   prioritization, not a confidentiality/integrity control. Publishing exact line numbers and code',
    '   excerpts grants an adversary no capability they would not already have from repo read access,',
    '   which is itself the precondition for the code being reachable. No exploit primitive is disclosed.',
    '   Verdict on Q3: documenting this is SAFE and is the normal, desirable engineering practice.',
    '',
    '4. RECOMMENDATION SAFETY REVIEW — the doc\'s three proposals suggest no insecure pattern.',
    '   (a) Child SD 1, import calculateOKRImpact/rankSDs from priority-scorer.js: a pure',
    '       de-duplication collapsing two implementations to one source of truth. Single-source-of-truth',
    '       is the SECURITY-POSITIVE direction — it removes the copy-drift class that produced this bug.',
    '       No new dependency, no new trust boundary, no privilege change.',
    '   (b) Child SD 2, schedule okr-priority-sync.js on day 28 (cron or GitHub Actions schedule:):',
    '       proposes only a TRIGGER, and contains NO credential material — no hardcoded secrets, no',
    '       inline connection string, no sample workflow YAML embedding a key. GitHub Actions',
    '       "schedule:" is a standard, sound scheduling mechanism; nothing insecure (no webhook with a',
    '       guessable URL, no unauthenticated HTTP trigger, no world-writable crontab) is suggested.',
    '   (c) Child SD 3, restore the okr_generation_log generator and wire day-15 review into the',
    '       EXISTING SMS-cadence channel: explicitly reuses an established channel rather than',
    '       inventing a new comms mechanism — the correct, lower-risk choice.',
    '   FORWARD-LOOKING ADVISORY (not a defect in this deliverable, no condition attached): when',
    '   Child SD 2 is built, okr-priority-sync.js needs SUPABASE_SERVICE_ROLE_KEY. If implemented as a',
    '   GitHub Actions job, that must come from an encrypted repository/environment secret referenced as',
    '   ${{ secrets.* }} and never be echoed into logs; service-role bypasses RLS, so the job should be',
    '   pinned to a protected environment. Also note Child SD 2 gates SD-creation dispatch on a',
    '   scheduled run — the failure mode to design for is fail-OPEN vs fail-CLOSED, which is an',
    '   availability decision worth making explicitly at build time.',
    '',
    '5. SECURITY CHECKLIST APPLICABILITY — no auth mechanism, authorization model, RLS policy,',
    '   API endpoint, user input path, or output-rendering surface is introduced or modified by this',
    '   SD. The RLS/auth.uid()/input-validation checklist items are N/A for a documentation-only change.',
    '   The SD\'s own one-off evidence scripts read credentials correctly via process.env with',
    '   dotenv/config (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — the required pattern, zero',
    '   hardcoded credentials. Note these are service-role scripts, appropriate for governance writes.',
  ].join('\n'),
  findings: [
    { severity: 'INFO', title: 'No secrets, credentials, connection strings, internal URLs, or PII in the committed design doc (full-file read + regex sweep, 0 matches)' },
    { severity: 'INFO', title: 'merge-base..HEAD = 4 files: the design doc + 3 of this SD\'s own scripts/one-off/*.mjs evidence scripts; zero production code modified' },
    { severity: 'INFO', title: 'HEAD~3..HEAD is a misleading range here (crosses merge a5860f8f4c3, pulls in SD-LEO-INFRA-COMPLETION-GATE-DATA-001-B files); merge-base scoping is the correct measurement' },
    { severity: 'INFO', title: 'CONFIRMED NO disclosure risk: SDNextSelector.js:35-48 divergence has no auth, data-exposure, or injection angle; worst case is mis-ranked internal work queues' },
    { severity: 'INFO', title: 'Recommendations introduce no insecure pattern: de-duplication is security-positive; cron/GH-Actions schedule: proposal contains no credential material' },
    { severity: 'LOW', title: 'ADVISORY for future Child SD 2 (not a defect here, no condition): okr-priority-sync.js needs SUPABASE_SERVICE_ROLE_KEY — use encrypted GH secrets + protected environment, never inline; decide fail-open vs fail-closed for the SD-creation gate' },
  ],
  execution_time_ms: 0,
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application,
  subAgentCode: 'SECURITY',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);
console.log('metadata:', JSON.stringify(results.metadata, null, 2));

const stored = await storeSubAgentResults(
  'SECURITY',
  sd.id,
  { id: 'SECURITY', name: 'Chief Security Architect' },
  results,
  { sdKey: SD_KEY, phase: 'EXEC' }
);
console.log('Stored:', JSON.stringify(stored, null, 2));
