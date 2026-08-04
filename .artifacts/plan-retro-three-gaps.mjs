import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
const SD_ID = 'SD-LEO-INFRA-THREE-GAPS-APPLIED-001';

const r = {
  verdict: 'PASS', confidence: 88,
  summary:
    'Retrospective 7e937b1a published. The SD delivered two fences and zero DDL, but the durable '
    + 'output is a pair of disciplines: a fence must assert on the COUPLING rather than on '
    + 'reachability, and DOCUMENTED is not the same as READ.',
  findings: [
    { id: 'a-hazard-can-fire-during-the-sd-that-predicts-it', severity: 'critical', note: 'THE HEADLINE. FR-3 described a FUTURE fail-open. The applied policy was amended mid-SD (20260803_bound_anon_ingress_source_type_qualifier.sql, between my 19:15Z and 21:55Z reads of the same object) and the fail-open arrived — via the DUAL of the predicted route. FR-3 said narrowing anon SELECT starves the count; nobody touched SELECT, they narrowed the COUNTED SET relative to what SELECT exposes. When an SD names a coupling, both sides of it need watching for the duration, not just the side the text names.' },
    { id: 'cold-is-more-dangerous-than-live-when-the-coldness-is-accidental', severity: 'critical', note: 'Coordinator 596e6e1f established the disarm is unreachable: venture_user_insert_feedback is dead end-to-end since 2026-07-04. So the rate limit is protected by a SECOND DEFECT, not by a working guard. SD-LEO-INFRA-DEAD-VENTURE-USER-001 exists to revive that door and would have revived it INTO a disarmed limit — the fix for one HIGH opening the hazard of another. A measured zero whose cause is a dead door is not safety.' },
    { id: 'a-fence-must-assert-on-the-coupling-not-on-reachability', severity: 'critical', note: 'THE DESIGN DECISION THAT PAID. Keying the fence on reachability would have flipped it green the moment the door died, and that green would have been read as evidence the coupling was sound. Keyed on the coupling it stays red until the coupling is actually repaired, and it goes green on its own when the routed fold lands — a progress signal rather than a nag. Recorded in signal 7c4fdee8 as INTENTIONAL so it is not later suppressed as a stale alarm.' },
    { id: 'documented-is-not-the-same-as-read', severity: 'critical', note: 'FR-1 asked us to amend a false closure claim. The KNOWN GAPS block had ALREADY conceded it, already named the storm branch, already stated the boundary accurately — and none of it travelled, because the only reader was a human who happened to open that file. The deliverable for UNDOCUMENTED knowledge is prose; the deliverable for UNREAD knowledge is an executable declaration. Reading the source before building changed what the FR was.' },
    { id: 'i-overstated-reachability-in-a-high-severity-signal', severity: 'warning', note: 'PROCESS FINDING AGAINST MYSELF. I reported the disarm as apparently LIVE; it was COLD. The mechanism claim held, the exposure claim did not. The correction was cheap ONLY because I had labelled the starvation as INFERRED and named the premise it rested on — but the headline still said more than the evidence supported, and a headline is what gets repeated.' },
    { id: 'four-more-instances-of-a-guard-reading-the-wrong-text', severity: 'warning', note: 'In code written specifically to detect text, I shipped four extraction bugs of one shape: anchoring on the first severity token read a jsonb projection instead of the WHERE clause; a normaliser ignoring table qualifiers made f.source_type and source_type a permanent false divergence; a [^)]* gap cannot cross a ::text cast; and correlated detection placed after literal detection fell through to unreadable, hiding a decidable divergence. Tests caught all four before shipping. Knowing the class does not confer immunity to it.' },
    { id: 'the-load-bearing-test-of-a-claim-scanner-is-the-negative', severity: 'warning', note: 'The honest paragraph explaining the gap contains every keyword of the false closure claim. A keyword scan flags it, and the resulting fix is to DELETE THE ACCURATE EXPLANATION — strictly worse than doing nothing. assertsUnreachability matches claim SHAPES and treats concession (false as stated / is not established) as correction, with the real KNOWN GAPS text as a test fixture.' },
    { id: 'scope-reductions-stated-not-absorbed', severity: 'info', note: 'Two FR outcomes shrank: the FR-3 counting-basis fix moved to DEAD-VENTURE-USER-001 where revive and bind must land together, and FR-4 produced ZERO DDL because both constrain branches were priced and declined (revoke breaks fleet-wide error capture; downgrading the storm severity suppresses a signal that should arguably reach the chairman). Both are defensible and both would have looked like quiet under-delivery had the reasoning stayed in my head instead of the PRD.' },
  ],
  metadata: {
    retrospective_id: '7e937b1a-84c5-41ad-ae32-acad9624ceef',
    quality_score: 88, frs: 5, commits: 4, tests_added: 41, seeded_defects: 11,
    ddl_applied: 0, migrations_staged: 0, live_defects_found_and_routed: 1,
    own_claims_corrected: 3, scope_reductions_stated: 2,
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6792',
    mechanism_verifications: [
      { verified_by: 'retrospective exists and post-dates EXEC-TO-PLAN', verified_at: 'retrospectives id=7e937b1a-84c5-41ad-ae32-acad9624ceef, retro_type=SD_COMPLETION, sd_id=c716c5de-0f55-4357-8f5d-593818293a8b' },
      { verified_by: 'the fence detects a REAL divergence, not only seeded ones', verified_at: 'node scripts/severity-pair-divergence-fence.mjs (clean) -> FR-3 DIVERGED, correlated on source_type vs anon SELECT pinned to telegram' },
      { verified_by: 'the fence also fails on a seeded mutation and passes clean on FR-2', verified_at: 'same CLI --seed-divergence -> FR-2 DIVERGED; clean -> FR-2 AGREES [critical, high] both sides' },
      { verified_by: 'the boundary probe matches the live catalog', verified_at: 'node scripts/probe-anon-chairman-reach.mjs -> MATCHES exit 0; storm_watermark issue/new/high, normal issue/new/medium' },
      { verified_by: 'revoking anon EXECUTE was declined on measured cost, not assumed safety', verified_at: 'lib/eva/config/venture-default-capabilities.js — error-capture-middleware ships to every venture calling the RPC with EHG_ENGINEER_SUPABASE_ANON_KEY' },
    ],
  },
  execution_time_ms: 600000,
};

const res = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'RETRO', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(r, res);
const s = await storeSubAgentResults('RETRO', SD_ID, { name: 'Continuous Improvement Coach' }, r, { phase: 'PLAN' });
console.log('STORED RETRO/PLAN id=' + (s && s.id));
