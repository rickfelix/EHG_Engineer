#!/usr/bin/env node
/**
 * score-architectural-hotspots.mjs — SD-LEO-INFRA-ARCHITECTURAL-HOTSPOTS-CHURN-001.
 *
 * Chairman sprint item 1 (frame-only): rank EHG_Engineer files by GIT CHURN ×
 * COMPLEXITY to find the load-bearing debt hotspots; Fable designs fixes for the
 * top offenders (framed as co_author_pending draft SDs); the fleet builds.
 *
 * REUSE CONTRACT: complexity comes from analyzeFile() in
 * scripts/eva/health-dimensions/complexity-scorer.mjs (SD-LEO-INFRA-COMPLEXITY-
 * SCORER-001) — this script defines NO local complexity logic (canary-tested).
 * Structural template: scripts/one-off/build-marketlens-triage-pack.mjs
 * (pack persistence + docs render + framed drafts + idempotency guards).
 *
 * Modes:
 *   (default)  dry — print the ranked table
 *   --verify   run the scoring pipeline twice at HEAD and compare hashes (TS-1)
 *   --execute  persist metadata.hotspot_pack + docs render + create the framed
 *              top-N design drafts (idempotent)
 * Flags: --window-days 90  --top 20  --designs 5
 */
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { analyzeFile } from '../eva/health-dimensions/complexity-scorer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_SD = 'SD-LEO-INFRA-ARCHITECTURAL-HOTSPOTS-CHURN-001';

const argvNum = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  const v = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const WINDOW_DAYS = argvNum('--window-days', 90);
const TOP_N = argvNum('--top', 20);
const DESIGN_N = argvNum('--designs', 5);
const EXECUTE = process.argv.includes('--execute');
const VERIFY = process.argv.includes('--verify');

// Source-file filter: rankable product code only.
const INCLUDE_RE = /^(lib|scripts)\/.+\.(js|cjs|mjs)$/;
const EXCLUDE_RE = /(^|\/)(node_modules|archive|one-off|one-time|__tests__|tests?)(\/|$)|\.test\.|\.spec\./;

function gitChurn(windowDays) {
  const out = execSync(
    `git log --since="${windowDays} days ago" --format= --name-only -- lib scripts`,
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  const counts = new Map();
  for (const raw of out.split('\n')) {
    const p = raw.trim().replace(/\\/g, '/');
    if (!p || !INCLUDE_RE.test(p) || EXCLUDE_RE.test(p)) continue;
    counts.set(p, (counts.get(p) || 0) + 1);
  }
  return counts;
}

function scoreOnce() {
  const rev = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const churn = gitChurn(WINDOW_DAYS);
  const rows = [];
  const unreadable = [];
  let maxChurn = 0;
  let maxComplexity = 0;

  for (const [p, c] of churn) {
    const abs = path.join(REPO_ROOT, p);
    if (!fs.existsSync(abs)) continue; // churned but since deleted
    let metrics = null;
    try {
      metrics = analyzeFile(fs.readFileSync(abs, 'utf8'), p);
    } catch { /* unreadable -> listed, unranked (FR-1 fail-honest) */ }
    if (!metrics) { unreadable.push(p); continue; }
    // Complexity composite mirrors the scorer's own emphasis: cyclomatic weight
    // + function density normalized by size (a 3k-line file of many branches
    // outranks a 3k-line data literal).
    const complexity = metrics.cyclomaticComplexity + metrics.functionCount * 2;
    maxChurn = Math.max(maxChurn, c);
    maxComplexity = Math.max(maxComplexity, complexity);
    rows.push({ path: p, churn: c, complexity, loc: metrics.lineCount });
  }
  for (const r of rows) {
    r.composite = Number(((r.churn / maxChurn) * (r.complexity / maxComplexity)).toFixed(4));
  }
  rows.sort((a, b) => b.composite - a.composite || b.churn - a.churn || a.path.localeCompare(b.path));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return { rev, rows: rows.slice(0, TOP_N), unreadable, total_scored: rows.length };
}

function tableHash(rows) {
  return createHash('sha256').update(JSON.stringify(rows.map(r => [r.path, r.churn, r.complexity, r.composite]))).digest('hex').slice(0, 16);
}

function printTable(result) {
  console.log(`rev=${result.rev} window=${WINDOW_DAYS}d scored=${result.total_scored} unreadable=${result.unreadable.length}`);
  console.log('rank | composite | churn | cmplx |   loc | path');
  for (const r of result.rows) {
    console.log(String(r.rank).padStart(4), '|', String(r.composite).padEnd(9), '|', String(r.churn).padStart(5), '|', String(r.complexity).padStart(5), '|', String(r.loc).padStart(5), '|', r.path);
  }
}

// ── Top-offender designs (authored at Fable depth AFTER the dry run; keyed by
//    path so ranking shifts never misattach a design). Every design: root
//    simplification THESIS, grep-verified seams, both-directions acceptance,
//    delegate-tier note, overlap notes, own door class (one_way). ─────────────
const DEVIATION_VALVE = 'Deviation valve: a documented-skip with reason recorded on the framed SD is a legal outcome; silent scope-shrink is not. These are re-architectures — one_way door class; a Fable-tier session executes or supervises.';
const DESIGNS = {
  'lib/eva/stage-execution-worker.js': {
    sd_slug: 'SD-ARCH-HOTSPOT-STAGE-WORKER-001',
    thesis_line: 'split the monolithic stage-execution loop into a stage-handler registry + a thin worker shell',
    body: 'THESIS: the #1 hotspot (composite 0.9985 — 94 commits/90d on 4,754 lines with only ~3 top-level functions) is a monolithic worker whose stage-specific logic lives inline in giant bodies; every stage tweak churns the whole file and its blast radius. TARGET SHAPE: (a) lib/eva/stage-handlers/<stage>.js — one module per stage (or stage-family) exporting execute(ctx); (b) a HANDLER REGISTRY (map stage->module, mirroring the proven GAUGE_REGISTRY / detector-registry patterns already in lib/governance + lib/coordinator/detectors.cjs); (c) stage-execution-worker.js shrinks to the shell: claim item -> resolve handler -> execute -> record -> loop. SEAMS (grep-verified at framing): getOperatingMode(stage) L93 already discriminates per-stage behavior (the registry key exists); isVentureFrozen L128 is shell-level (stays); formatDuration L105 utility (extract to lib/eva/util). ACCEPTANCE (miss): registry + >=3 extracted stage handlers land; the shell file drops below ~1,200 lines; adding a new stage touches ONLY a new handler module + one registry line. ACCEPTANCE (pass): every existing eva/stage test suite green; zero behavior change per stage (fixture-run parity on at least 2 stages). DELEGATE NOTE: after the split, per-stage handler edits become two_way-delegable (bounded module, flag-gateable); today every edit is a one_way-adjacent monolith touch. OVERLAP: none in-flight (verify vs belt at convergence).',
  },
  'scripts/leo-create-sd.js': {
    sd_slug: 'SD-ARCH-HOTSPOT-LEO-CREATE-001',
    thesis_line: 'extract the nine createFrom* lanes into a source-adapter registry over one shared createSD core',
    body: 'THESIS: #2 (composite 0.617; 58 commits/90d; 3,500 lines; cmplx 646 — the HIGHEST raw complexity) accretes one createFrom<Source> lane per intake (UAT L330, Learn L392, Feedback L441, RoadmapItem L611, QF L705, createChild L803, Plan L1006 — grep-verified), each re-deriving mapping/validation slightly differently; plus createSD L1635 with process.exit(1) inside library code (session finding ec36b279: kills callers mid-loop). TARGET SHAPE: (a) lib/sd-creation/source-adapters/<source>.js each exporting toDraft(input)->CreateSDOptions; (b) ONE shared pipeline: adapter -> enrich-defaults (the buildDefault* family L1471-1634 moves here) -> validate -> insert; (c) createSD returns {ok,error} — never process.exit — with a thin CLI wrapper owning exit codes. SEAMS: the buildDefault* functions are already pure (L1471,1508,1533,1564,1616); mapToDbType L1395 + resolveSdType L1463 shared; inheritStrategicFields L1349 is the Child adapter. ACCEPTANCE (miss): adapters land for >=4 sources; createSD exits nowhere; the CLI file drops below ~800 lines. ACCEPTANCE (pass): every creation path proven by the existing creation tests + one fixture create per adapter; SD rows byte-equivalent for a fixed input. DELEGATE NOTE: new intake sources become two_way (one adapter file). OVERLAP: sd-create skill + leo-create flows call the CLI — interface preserved.',
  },
  'scripts/stale-session-sweep.cjs': {
    sd_slug: 'SD-ARCH-HOTSPOT-SWEEP-001',
    thesis_line: 'decompose the 2,900-line sweep main() into an ordered pass-registry with per-pass isolation',
    body: 'THESIS: #3 (composite 0.5706; 61 commits/90d) — main() is a sequential monolith of numbered concern-blocks (QF reaping, dormancy watchdog, identity collisions, source-side telemetry, classification, HEADLESS_ZOMBIE, claim-boundary probe [added by this session — its runClaimBoundaryProbe extraction is the PROOF the pattern works], npm locks, QA scans, dead-letter planning, detectors). Every new guard churns main(). TARGET SHAPE: (a) lib/sweep/passes/<pass>.cjs each exporting {name, run(ctx)} where ctx carries {supabase, now, classified, telemetryMap, actions, warnings}; (b) an ORDERED PASS REGISTRY (array, explicit order — order is load-bearing) with per-pass try/catch isolation (the pattern main() already applies ad hoc); (c) main() shrinks to: gather inputs -> run passes -> report. SEAMS (built-in today, fresh knowledge; name-anchored — grep the names, line refs drift): runClaimBoundaryProbe is ALREADY the target shape (exported, ctx-taking, isolated) — the template pass; clearStaleQfClaims L814, isHeadlessZombie L291 plus its classification call sites in main(), evaluateSourceSideSignals closure (needs ctx-ification), the detector-registry invocation block in main() (grep the detectors.cjs call site). ACCEPTANCE (miss): >=5 passes extracted with the registry; main() below ~600 lines; a new guard = one pass file + one registry line. ACCEPTANCE (pass): the full sweep unit-suite family green (headless-zombie, qf211, qf162, dormancy-gate, claim-safety static tests updated for new file layout ONLY where they pin source text); one live sweep run output-equivalent. DELEGATE NOTE: individual passes become two_way-editable. OVERLAP: claim-safety static test anchors on source text (session finding 04847713) — the design INCLUDES migrating those anchors to the pass files.',
  },
  'scripts/worker-checkin.cjs': {
    sd_slug: 'SD-ARCH-HOTSPOT-CHECKIN-001',
    thesis_line: 'turn the resolveCheckin claim-ladder into an explicit pipeline of guard/acquire steps',
    body: 'THESIS: #4 (composite 0.5065; 66 commits/90d — the HIGHEST churn density per line) — resolveCheckin is a single function accreting numbered rungs (2c metadata merge, 2c-2 quarantine self-clear [added today], 2b callsign rehydrate, 3 roll-call, 4 resume w/ stale-terminal healing, 5.x recovery tiers, 5.9 self-claim gates, QF jump, merged-pool self-claim) — every policy change edits the ladder in place. TARGET SHAPE: (a) lib/checkin/steps/<step>.cjs each exporting {name, applies(ctx), run(ctx)} returning {action?...} to short-circuit or ctx mutations to continue; (b) an ordered STEP PIPELINE (the ladder made explicit and testable per-step); (c) worker-checkin.cjs keeps the CLI + the exported pure helpers (isSelfClaimDisabled, isQuarantined etc. — already extracted style). SEAMS (fresh): selfClearQuarantine + isQuarantined (added today) are the template step; mergeCheckinModelEffort L1231; rehydrateCallsign; registerRollCall; recoverStrandedFinal + adoptOrphanInProgress (recovery steps); selfClaimQuickFix + selfClaimDraftSd (acquire steps). ACCEPTANCE (miss): >=6 steps extracted; resolveCheckin below ~400 lines; a new gate = one step file + registry line. ACCEPTANCE (pass): the checkin unit-suite family green (standdown, merged-pool, critical-jump, deleted-claim, anti-winddown); a live checkin returns byte-equivalent action JSON for the resume and idle paths. DELEGATE NOTE: individual steps become two_way. OVERLAP: three-table completion + door-routing (shipped today) read checkin outputs — interfaces preserved.',
  },
  'scripts/sd-start.js': {
    sd_slug: 'SD-ARCH-HOTSPOT-SD-START-001',
    thesis_line: 'extract the claim/gate/worktree phases of sd-start into composable modules shared with checkin',
    body: 'THESIS: #5 (composite 0.3389; 49 commits/90d; 2,125 lines) — sd-start interleaves gates (enforceDependencyGate L99, enforceHumanActionGate L176, enforceCadenceGate L631, verifyHandoffIntegrity L295), queue intelligence (getNextWorkableSD L245, findLeafWorkItem L494, findUnclaimedChild L548), display (displayFleetRoster L190), and worktree activation inside one CLI; much of the gate/queue logic semantically duplicates worker-checkin counterparts (claim-eligibility drift class — the backlog-rank claimable-vs-eligibility divergence is a KNOWN recurring bug family). TARGET SHAPE: (a) lib/claim/gates/*.cjs shared by BOTH sd-start and worker-checkin (one eligibility truth — kills the divergence class); (b) lib/claim/queue-resolver.cjs (workable-SD + leaf/child resolution); (c) sd-start.js keeps CLI/display/worktree orchestration. SEAMS: the six functions above are already top-level and near-pure (grep-verified); claim-eligibility.cjs ALREADY exists as the shared-predicate precedent — this design extends that consolidation. ACCEPTANCE (miss): >=4 gates/resolvers extracted into lib/claim shared modules with checkin consuming >=2 of them; sd-start below ~1,200 lines. ACCEPTANCE (pass): sd-start behavior parity on claim/resume/orchestrator-child paths (existing suites + one live claim cycle); no checkin regressions. DELEGATE NOTE: gate tweaks become two_way. OVERLAP: HIGH with SD-ARCH-HOTSPOT-CHECKIN-001 — SEQUENCE AFTER it (shared lib/claim modules land there first or here, coordinator picks the order; both designs name the same target namespace deliberately).',
  },
};

async function executePersist(result) {
  const require2 = (await import('node:module')).createRequire(import.meta.url);
  require2('dotenv').config({ path: path.join(REPO_ROOT, '.env') });
  const { createSupabaseServiceClient } = require2(path.join(REPO_ROOT, 'lib', 'supabase-client.cjs'));
  const sb = createSupabaseServiceClient();

  const { data: sd, error } = await sb.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SOURCE_SD).maybeSingle();
  if (error || !sd) throw new Error('source SD read failed: ' + (error?.message || 'not found'));

  const pack = {
    params: { rev: result.rev, window_days: WINDOW_DAYS, top: TOP_N, generated_at: new Date().toISOString() },
    table: result.rows,
    unreadable: result.unreadable,
    total_scored: result.total_scored,
  };
  const { error: upErr } = await sb.from('strategic_directives_v2')
    .update({ metadata: { ...sd.metadata, hotspot_pack: pack } }).eq('id', sd.id);
  if (upErr) throw new Error('pack persist failed: ' + upErr.message);
  console.log('✓ metadata.hotspot_pack persisted (' + result.rows.length + ' rows)');

  // Docs render
  const lines = ['# Architectural Hotspots — churn × complexity', '',
    `> Source: \`${SOURCE_SD}\` · rev \`${result.rev.slice(0, 12)}\` · window ${WINDOW_DAYS}d · generated ${pack.params.generated_at}`,
    '> DB-first truth: `metadata.hotspot_pack` on the source SD. Re-running `node scripts/one-off/score-architectural-hotspots.mjs` re-scores at CURRENT HEAD/date (the 90d window is wall-clock-relative) — it does not reproduce this pinned table.',
    '> Window bias: a 90-day window over-weights files hammered in recent sprints; churn and complexity components are shown separately so the reader can discount.', '',
    '| # | Composite | Churn | Complexity | LOC | File |', '|---|---|---|---|---|---|'];
  for (const r of result.rows) lines.push(`| ${r.rank} | ${r.composite} | ${r.churn} | ${r.complexity} | ${r.loc} | \`${r.path}\` |`);
  lines.push('', '## Framed designs', '');
  const designedPaths = Object.keys(DESIGNS);
  for (const p of designedPaths) lines.push('- `' + p + '` → ' + DESIGNS[p].sd_slug + ' — ' + DESIGNS[p].thesis_line);
  if (!designedPaths.length) lines.push('_Design drafts created separately (see hotspot_link metadata on draft SDs)._');
  const docPath = path.join(REPO_ROOT, 'docs', 'reference', 'architectural-hotspots.md');
  fs.mkdirSync(path.dirname(docPath), { recursive: true });
  fs.writeFileSync(docPath, lines.join('\n') + '\n');
  console.log('✓ doc written:', docPath);

  // Framed design drafts (top-DESIGN_N, idempotent on hotspot_link).
  const { pathToFileURL } = await import('node:url');
  const { createSD } = await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'leo-create-sd.js')).href);
  const created = [];
  for (const row of result.rows.slice(0, DESIGN_N)) {
    const d = DESIGNS[row.path];
    if (!d) { console.log('  (no design authored for', row.path, '— skipped)'); continue; }
    const { data: existing } = await sb.from('strategic_directives_v2')
      .select('sd_key')
      .eq('metadata->hotspot_link->>source_sd', SOURCE_SD)
      .eq('metadata->hotspot_link->>path', row.path)
      .limit(1);
    if (existing && existing.length) { created.push({ path: row.path, key: existing[0].sd_key, existed: true }); continue; }
    // Per-draft isolation: pack+doc are already persisted above; one failed
    // createSD must not abort the remaining drafts (re-run self-heals via
    // the hotspot_link guard, but don't leave the batch half-done needlessly).
    try {
      const sdOut = await createSD({
        sdKey: d.sd_slug,
        title: 'Hotspot re-architecture: ' + d.thesis_line + ' (' + row.path + ')',
        description: d.body + '\n\n' + DEVIATION_VALVE,
        type: 'refactor',
        priority: 'high',
        rationale: 'Framed by ' + SOURCE_SD + ' (chairman sprint item 1): rank ' + row.rank + ' hotspot, composite ' + row.composite + ' (churn ' + row.churn + ' × complexity ' + row.complexity + ' over ' + WINDOW_DAYS + 'd). Fable-designed; fleet builds.',
        scope: 'See description: thesis, seams, both-directions acceptance. Door class: one_way (re-architecture). Intensity: architectural.',
        metadata: {
          hotspot_link: { source_sd: SOURCE_SD, path: row.path, rank: row.rank, composite: row.composite },
          co_author_pending: true,
          door_class_note: 'one_way',
        },
      });
      created.push({ path: row.path, key: (sdOut && sdOut.sd_key) || d.sd_slug, existed: false });
    } catch (e) {
      created.push({ path: row.path, key: d.sd_slug, failed: e.message });
    }
  }
  console.log('✓ framed drafts:');
  created.forEach(c => console.log('   ', c.failed ? 'FAILED   ' : c.existed ? '(existing)' : 'created ', c.key, '←', c.path, c.failed ? '— ' + c.failed : ''));
  const failures = created.filter(c => c.failed);
  if (failures.length) {
    console.error('✗ ' + failures.length + ' draft(s) failed — re-run --execute after fixing (idempotency skips the rest)');
    process.exitCode = 1;
  }
  return { sb, sd, created };
}

(async () => {
  const result = scoreOnce();
  if (VERIFY) {
    const second = scoreOnce();
    const h1 = tableHash(result.rows); const h2 = tableHash(second.rows);
    console.log('determinism:', h1 === h2 ? 'IDENTICAL (' + h1 + ')' : `MISMATCH ${h1} vs ${h2}`);
    if (h1 !== h2) process.exit(1);
  }
  printTable(result);
  if (!EXECUTE) return;
  await executePersist(result);
})();
