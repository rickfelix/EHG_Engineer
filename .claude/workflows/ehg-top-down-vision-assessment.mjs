export const meta = {
  name: 'ehg-top-down-vision-assessment',
  description: 'Top-down vision assessment of EHG: construct the complete intended vision from app+docs, audit each capability BUILT-vs-lipstick CROSS-REPO (app + harness + shared DB), walk backwards from exit/income to find where the envisioned chain breaks, produce verified candidate gaps. Re-runnable; diff against the latest docs/reports/ehg-top-down-vision-assessment-*.md baseline.',
  phases: [
    { title: 'Derive', detail: 'construct the complete intended vision from 3 sources: the live app, vision docs, EHG documentation' },
    { title: 'Canonize', detail: 'reconcile into one canonical complete-vision lifecycle spec' },
    { title: 'Audit', detail: 'per-capability BUILT/PARTIAL/SHELL/MOCK/MISSING audit CROSS-REPO (ehg app + EHG_Engineer harness + shared DB)' },
    { title: 'Backtrace', detail: 'walk backwards from exit/income to find chain breaks + structural gaps' },
    { title: 'Verify', detail: 'verify-premise each gap cross-repo (backstop against app-only false-negatives)' },
  ],
}

// ── REPLICATION NOTES (read before running) ──────────────────────────────────
// 1. CROSS-REPO IS LOAD-BEARING. EHG = two repos + one shared DB:
//      - rickfelix/ehg            (EHG_ROOT below) = the operator UI / read-layer
//      - rickfelix/EHG_Engineer   (ENGINEER_ROOT)  = the LEO/EVA venture-lifecycle ENGINE
//      - shared Supabase project dedlbzhpgkmetvhbkyzq = the contract between them
//    A capability ABSENT from ehg/src is NOT "missing" if the harness produces it and the
//    DB holds real rows. The 2026-06-24 v1 run audited ehg/src ALONE and falsely called 11
//    capabilities SHELL; verify-premise reversed 4/4 tested. This version makes the AUDIT
//    phase cross-repo from the start. See docs/process/top-down-vision-assessment.md.
// 2. BEFORE RUNNING: refresh the EXCLUDE list (already-sourced/shipped SDs) so the backtrace
//    does not re-surface closed gaps. Pull recent SD-EHG-* keys+titles.
// 3. AFTER RUNNING: write findings to docs/reports/ehg-top-down-vision-assessment-<date>.md
//    and DIFF against the prior baseline — the point is to catch the NEXT layer of gaps.

const EHG_ROOT = 'C:\\Users\\rickf\\Projects\\_EHG\\ehg'
const EHG = EHG_ROOT + '\\src'
const ENGINEER_ROOT = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer'
const ENGINE = ENGINEER_ROOT + '\\lib\\eva'

const FRAME = [
  'FRAME (load-bearing):',
  '- EHG IS TWO REPOS + ONE SHARED DB. (a) The operator UI app rickfelix/ehg at ' + EHG_ROOT + ' (code ' + EHG + ', docs ' + EHG_ROOT + '\\docs) is a THIN UI / read-layer. (b) The LEO/EVA venture-lifecycle ENGINE is rickfelix/EHG_Engineer at ' + ENGINEER_ROOT + ' (esp. ' + ENGINE + '\\** and ' + ENGINEER_ROOT + '\\scripts\\**). (c) Both point at the SAME Supabase project (dedlbzhpgkmetvhbkyzq) which is the contract between them.',
  '- CARDINAL RULE: a capability that is absent from ehg/src is NOT "missing/SHELL" if the EHG_Engineer harness produces it and the shared DB holds real rows. ALWAYS check both repos AND the DB before any MISSING/SHELL verdict. (A prior run audited the app alone and falsely called 11 capabilities hollow — the engine was in the harness all along.)',
  '- YOU MUST CONSTRUCT THE COMPLETE INTENDED VISION YOURSELF by triangulating: (1) what the app+harness actually are now, (2) the EHG VISION DOCUMENTS, (3) the EHG DOCUMENTATION. Read and synthesize; do not assume.',
  '- THE ENVISIONED ARC (the spine to assess against): EHG runs the FULL venture lifecycle end-to-end with a solo operator + AI (EVA): (1) IDEATION — the system GENERATES venture ideas; (2) VALIDATION/RESEARCH; (3) BUILD; (4) OPERATIONS; (5) MARKETING & DISTRIBUTION; (6) COMPOUNDING & SELF-IMPROVEMENT; (7) SALE/EXIT. NORTH STAR = EHG income replacing the operator salary, so the chain must drive idea -> revenue -> realized income/exit.',
  '- CENTRAL QUESTION: is EHG actually DESIGNED AND BUILT TO PERFORM this arc, or is it lipstick — UI shells / mock data / partial scaffolds that look like the capability but cannot do it? Judge strictly, file:line evidence, CROSS-REPO. A pretty component over an empty DB column is a SHELL; a thin UI over a real harness producer that wrote real rows is BUILT.',
  '- HONESTY MANDATE: evidence over optimism, but also evidence over alarmism — do not call a capability hollow until you have checked the harness + DB. Conviction over volume.',
].join('\n')

const LIFECYCLE_DERIVE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    lens: { type: 'string' },
    sources_read: { type: 'array', items: { type: 'string' } },
    capabilities: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          name: { type: 'string' },
          lifecycle_stage: { type: 'string', enum: ['ideation', 'validation', 'build', 'operations', 'marketing-distribution', 'compounding-self-improvement', 'sale-exit', 'cross-cutting'] },
          intended_story: { type: 'string' },
          how_it_works: { type: 'string' },
          source_evidence: { type: 'string' },
        },
        required: ['name', 'lifecycle_stage', 'intended_story', 'how_it_works', 'source_evidence'],
      },
    },
  },
  required: ['lens', 'sources_read', 'capabilities'],
}

const CANON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    lifecycle: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          lifecycle_stage: { type: 'string', enum: ['ideation', 'validation', 'build', 'operations', 'marketing-distribution', 'compounding-self-improvement', 'sale-exit', 'cross-cutting'] },
          intended_story: { type: 'string' },
          how_it_works: { type: 'string' },
          primary_code_locations: { type: 'array', items: { type: 'string' }, description: 'best-guess implementing files in EITHER repo' },
        },
        required: ['id', 'name', 'lifecycle_stage', 'intended_story', 'how_it_works', 'primary_code_locations'],
      },
    },
    north_star_thread: { type: 'string' },
  },
  required: ['lifecycle', 'north_star_thread'],
}

const AUDIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    capability_id: { type: 'string' },
    capability_name: { type: 'string' },
    lifecycle_stage: { type: 'string' },
    build_state: { type: 'string', enum: ['BUILT', 'PARTIAL', 'SHELL', 'MOCK', 'MISSING'] },
    app_evidence: { type: 'string', description: 'ehg/src finding (UI/render layer) with file:line' },
    engine_evidence: { type: 'string', description: 'EHG_Engineer harness finding (producer/worker) with file:line — REQUIRED before any MISSING/SHELL verdict' },
    db_evidence: { type: 'string', description: 'shared-DB rows that prove the capability ran (table + count) or their absence' },
    whats_real: { type: 'string' },
    whats_missing: { type: 'string' },
    lipstick: { type: 'boolean' },
    blocks_northstar_loop: { type: 'boolean' },
  },
  required: ['capability_id', 'capability_name', 'lifecycle_stage', 'build_state', 'app_evidence', 'engine_evidence', 'db_evidence', 'whats_real', 'whats_missing', 'lipstick', 'blocks_northstar_loop'],
}

const BACKTRACE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    narrative: { type: 'string' },
    chain_breaks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          lifecycle_stage: { type: 'string' },
          capability_name: { type: 'string' },
          build_state: { type: 'string' },
          why_it_breaks_the_loop: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['lifecycle_stage', 'capability_name', 'build_state', 'why_it_breaks_the_loop', 'severity'],
      },
    },
    structural_gaps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          lifecycle_stage: { type: 'string' },
          buildable_now: { type: 'boolean' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          conviction: { type: 'string', enum: ['high', 'medium', 'low'] },
          dependencies: { type: 'array', items: { type: 'string' } },
          dedup_note: { type: 'string' },
        },
        required: ['title', 'problem', 'evidence', 'lifecycle_stage', 'buildable_now', 'priority', 'conviction', 'dependencies', 'dedup_note'],
      },
    },
    healthy_capabilities: { type: 'array', items: { type: 'string' } },
  },
  required: ['narrative', 'chain_breaks', 'structural_gaps', 'healthy_capabilities'],
}

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string' },
    is_real_gap: { type: 'boolean' },
    verdict: { type: 'string', enum: ['confirmed', 'already-built', 'overstated', 'needs-chairman-input', 'out-of-scope-v1', 'low-value'] },
    reasoning: { type: 'string' },
  },
  required: ['title', 'is_real_gap', 'verdict', 'reasoning'],
}

// REFRESH THIS each run (already-sourced/shipped SD-EHG-* so the backtrace does not re-surface closed gaps).
const EXCLUDE = (typeof args === 'object' && args && args.exclude)
  ? String(args.exclude)
  : 'ALREADY SOURCED (do not re-surface): per-venture first-revenue wire; portfolio MRR rollup; venture health_score scale fix; EVA north-star query; cockpit distance-to-quit (net income); distance-to-broke runway gauge + cash-attest feed (shipped); first-revenue tracking; persist projected revenue; launch-readiness view; survivability cockpit; Stage-24 go-live backend; orphan/dead-code retirements.'

phase('Derive')
const DERIVE_LENSES = [
  { key: 'vision-docs', prompt: 'LENS = the EHG VISION DOCUMENTS + documentation. Read ' + EHG_ROOT + '\\docs\\** and ' + ENGINEER_ROOT + '\\docs\\vision\\** + ' + ENGINEER_ROOT + '\\docs\\venture-fundamentals\\** and repo-root *.md. Extract the COMPLETE intended vision as DESCRIBED IN WRITING across the full arc, each capability with intended_story + how_it_works, cited to the doc. Where docs are thin on a stage, say so.' },
  { key: 'codified-workflow', prompt: 'LENS = the codified workflow AS BUILT. Read the UI side (ehg: src/config/venture-workflow.ts, src/config/surfaceRegistry.ts, src/types/vision-v2.ts, src/components/stages/*) AND the engine side (EHG_Engineer: ' + ENGINE + '\\stage-templates\\analysis-steps\\* , ' + ENGINE + '\\stage-execution-worker.js, ' + ENGINE + '\\stage-zero\\**). Extract the intended lifecycle as codified across BOTH repos.' },
  { key: 'eva-and-edges', prompt: 'LENS = the AI engine + lifecycle EDGES. Ideation generation (EHG_Engineer/scripts/stage-zero-queue-processor.js, ' + ENGINE + '\\stage-zero\\paths\\*), marketing/distribution (ehg/src/components/creative-media/*), compounding/self-improvement (EHG_Engineer recursion/override/calibration engines), and SALE/EXIT (' + ENGINE + '\\exit\\* + ehg exit UI). Also EVA directive engine (ehg services + any harness consumer). Extract intended capabilities for these edges across both repos.' },
]
const derived = (await parallel(DERIVE_LENSES.map((l) => () =>
  agent(
    FRAME + '\n\nYOUR LENS: ' + l.key + '\n' + l.prompt + '\n\nReturn intended capabilities with intended_story + how_it_works + source_evidence; list sources actually read. Focus on what EHG is SUPPOSED to do, not yet on whether it is built.',
    { label: 'derive:' + l.key, phase: 'Derive', schema: LIFECYCLE_DERIVE_SCHEMA },
  )
))).filter(Boolean)
log('Derived the intended vision from ' + derived.length + '/3 sources (' + derived.reduce((n, d) => n + (d.capabilities ? d.capabilities.length : 0), 0) + ' raw capabilities)')

phase('Canonize')
const canon = await agent(
  FRAME + '\n\nThree source-lens derivations (JSON):\n' + JSON.stringify(derived) + '\n\nReconcile into ONE canonical, ordered, COMPLETE intended-vision lifecycle spec covering the full arc plus cross-cutting capabilities (operator cockpit, EVA command-bus, north-star). De-duplicate. Each capability: crisp intended_story + how_it_works + best-guess primary_code_locations (in EITHER repo). Then north_star_thread. Be COMPLETE even where a stage looks absent — include it so the audit can verify cross-repo.',
  { label: 'canonize', phase: 'Canonize', schema: CANON_SCHEMA },
)
log('Canonical complete-vision lifecycle: ' + canon.lifecycle.length + ' capabilities')

phase('Audit')
const audits = (await parallel(canon.lifecycle.map((cap) => () =>
  agent(
    FRAME + '\n\nAUDIT ONE CAPABILITY cross-repo.\nCAPABILITY: ' + cap.name + ' (stage: ' + cap.lifecycle_stage + ')\nINTENDED: ' + cap.intended_story + '\nHOW: ' + cap.how_it_works + '\nLIKELY CODE: ' + (cap.primary_code_locations || []).join(', ') + '\n\nMANDATORY ORDER: (1) read the UI in ' + EHG + ' (app_evidence). (2) BEFORE concluding MISSING/SHELL, read the harness in ' + ENGINE + ' and ' + ENGINEER_ROOT + '\\scripts (engine_evidence) — the producer usually lives here. (3) Query the shared Supabase DB for real rows proving it ran (db_evidence; use the supabase tools via ToolSearch). Judge build_state: BUILT (performs end-to-end on real data, proven by DB rows) / PARTIAL / SHELL (UI exists but NO real producer in EITHER repo and NO real rows) / MOCK / MISSING. lipstick=true only if it looks like the capability but cannot perform it after checking BOTH repos. Do not call it hollow on an app-only read.',
    { label: 'audit:' + cap.id, phase: 'Audit', schema: AUDIT_SCHEMA },
  )
))).filter(Boolean)
const counts = audits.reduce((m, a) => { m[a.build_state] = (m[a.build_state] || 0) + 1; return m }, {})
log('Audited ' + audits.length + ' capabilities -- ' + Object.keys(counts).map((k) => k + ':' + counts[k]).join(' '))

phase('Backtrace')
const backtrace = await agent(
  FRAME + '\n\n' + EXCLUDE + '\n\nCanonical intended vision (JSON):\n' + JSON.stringify(canon) + '\n\nCross-repo build audit (JSON):\n' + JSON.stringify(audits) + '\n\nWORK BACKWARDS from the end goal (SELL a venture / realize income) through marketing-distribution, operations, build, validation, to ideation. At each step: given what is actually BUILT (cross-repo), can the chain reach this step? Identify where the chain BREAKS (first load-bearing SHELL/MOCK/MISSING on the critical path). Produce: (1) narrative; (2) chain_breaks with severity; (3) structural_gaps = candidate SDs to close real breaks, ranked by north-star-loop impact, each with priority + dependencies + dedup_note + buildable_now (false if needs a chairman product decision or is V2/V3). Ruthless on conviction. List healthy_capabilities genuinely BUILT.',
  { label: 'backtrace', phase: 'Backtrace', schema: BACKTRACE_SCHEMA },
)
log('Backtrace: ' + backtrace.chain_breaks.length + ' chain-break(s), ' + backtrace.structural_gaps.length + ' structural gap(s)')

phase('Verify')
const verified = (await parallel((backtrace.structural_gaps || []).map((g) => () =>
  agent(
    FRAME + '\n\nVERIFY-PREMISE (skeptic, default to refuting). Claimed gap:\nTITLE: ' + g.title + '\nPROBLEM: ' + g.problem + '\nEVIDENCE: ' + g.evidence + '\nSTAGE: ' + g.lifecycle_stage + '\nDEDUP: ' + g.dedup_note + '\n\nRe-read BOTH repos (ehg ' + EHG + ' AND harness ' + ENGINE + ' / ' + ENGINEER_ROOT + '\\scripts) AND the shared DB. Verdict: confirmed (real, un-built in BOTH repos) / already-built (exists, likely in the harness the app-audit missed) / overstated / needs-chairman-input / out-of-scope-v1 / low-value. is_real_gap=true ONLY for confirmed. The most common false positive is a capability the harness builds that the app-only view missed — check for it explicitly.',
    { label: 'verify:' + (g.title || '').slice(0, 22), phase: 'Verify', schema: VERIFY_SCHEMA },
  ).then((v) => ({ ...g, verify: v }))
))).filter(Boolean)
const confirmed = verified.filter((g) => g.verify && g.verify.is_real_gap)
const otherVerdicts = verified.filter((g) => !(g.verify && g.verify.is_real_gap)).map((g) => ({ title: g.title, verdict: g.verify && g.verify.verdict, reason: g.verify && g.verify.reasoning }))

return {
  intended_lifecycle: canon.lifecycle.map((c) => ({ id: c.id, name: c.name, stage: c.lifecycle_stage, intended_story: c.intended_story, how_it_works: c.how_it_works })),
  north_star_thread: canon.north_star_thread,
  build_scorecard: audits.map((a) => ({ capability: a.capability_name, stage: a.lifecycle_stage, state: a.build_state, lipstick: a.lipstick, blocks_loop: a.blocks_northstar_loop, whats_missing: a.whats_missing, app_evidence: a.app_evidence, engine_evidence: a.engine_evidence, db_evidence: a.db_evidence })),
  build_state_counts: counts,
  backtrace_narrative: backtrace.narrative,
  chain_breaks: backtrace.chain_breaks,
  healthy_capabilities: backtrace.healthy_capabilities,
  confirmed_structural_gaps: confirmed.map((g) => ({ title: g.title, problem: g.problem, evidence: g.evidence, stage: g.lifecycle_stage, buildable_now: g.buildable_now, priority: g.priority, conviction: g.conviction, dependencies: g.dependencies, dedup_note: g.dedup_note, verdict: g.verify.verdict })),
  rejected_gaps: otherVerdicts,
}
