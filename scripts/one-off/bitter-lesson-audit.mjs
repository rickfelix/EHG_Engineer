#!/usr/bin/env node
/**
 * Bitter Lesson Audit — SD-LEO-INFRA-BITTER-LESSON-AUDIT-001 (chairman sprint item 4)
 *
 * (a) Classify every enumerated harness component's hand-coded heuristics:
 *     KEEP (structurally necessary) | REPLACE_WITH_GENERAL (general method + capability
 *     trigger + seam) | PARAMETERIZE (model-agnostic config). The lesson: general methods
 *     that leverage model capability beat hand-engineered knowledge over time — every
 *     KEEP must say why it survives that, every heuristic must name what retires it.
 * (b) Inventory REVISIT-IF workaround tags (lib/governance/revisit-tags.js grammar).
 * (c) Model-ID seam audit: bucket every provider model-ID hit outside the canonical seam
 *     (lib/config/model-config.js) via the exclusion taxonomy BEFORE any QF is filed.
 *
 * Usage: node scripts/one-off/bitter-lesson-audit.mjs [--execute] [--assert-comment-only]
 *   (dry)                  print ledger summary
 *   --execute              persist metadata.bitter_lesson_ledger + render the doc
 *   --assert-comment-only  verify tag-file diffs vs origin/main add only comment lines
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { detectExpiredPremises } from '../../lib/governance/revisit-tags.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_SD = 'SD-LEO-INFRA-BITTER-LESSON-AUDIT-001';
const EXECUTE = process.argv.includes('--execute');
const ASSERT_COMMENTS = process.argv.includes('--assert-comment-only');

// ── (a) Component classification (Fable-authored; the model-depth core) ──────
const COMPONENTS = [
  {
    name: 'dispatch tier-ladder (static model→rank map + DELEGATE_TIERS list)',
    paths: ['lib/coordinator/dispatch.cjs', 'lib/fleet/door-constants.cjs'],
    classification: 'PARAMETERIZE',
    reasoning: 'Model NAMES and their rank ordering are point-in-time lineup knowledge hand-baked into code; every new model family (Gemini 3.5, Claude 5.x tiers) forces source edits. The ordering CONCEPT is structural; the mapping is config-class data.',
    capability_trigger: 'Any lineup change — nearest known: Gemini 3.5 GA (mid-July) and post-Tuesday delegate-tier expansion.',
    replacement_spec: 'Move the model→rank map and DELEGATE_TIERS into lib/config/model-config.js as data (same seam that already owns per-provider model IDs); dispatch reads capability tiers, never names. REVISIT-IF tags stamped at both sites.',
  },
  {
    name: 'one-way-door exclusivity (declared !== fable, name-keyed fail-closed)',
    paths: ['lib/coordinator/dispatch.cjs'],
    classification: 'KEEP',
    reasoning: 'Deliberate safety invariant: irreversible work waits for the strongest tier, and UNDECLARED fails closed. Name-keying is the interim because no delegate capability ATTESTATION exists — the conservative direction is correct for an exclusivity gate even under the bitter lesson (safety floors are structural, not capability proxies).',
    capability_trigger: 'Delegate capability attestation shipping (evals proving a tier handles one-way-door work) flips this from name-keyed to attestation-keyed.',
    replacement_spec: 'Generalize to attested-capability gating when attestation exists; REVISIT-IF tag stamped at the site.',
  },
  {
    name: 'gate verdict engines (token-grep scoring: workflow-validator, metric-auto-verifier extractNumber first-numeric-token)',
    paths: ['scripts/modules/handoff', 'lib (gate validators)'],
    classification: 'REPLACE_WITH_GENERAL',
    reasoning: 'Referent-audit finding (this sprint): token-grep verdict engines score surface tokens, not meaning — workers learn to phrase artifacts for the grep (metric actuals must LEAD with the percentage because extractNumber takes the first numeric token). Hand-engineered parsing that models already beat.',
    capability_trigger: 'Cheap fast models (haiku-class) reliably judging structured rubrics with constrained decoding — capability exists TODAY; the blocker is per-gate latency/cost budget, which keeps shrinking.',
    replacement_spec: 'LLM-as-judge per gate: rubric + artifact → constrained-decoding verdict JSON (reference_llm_json_use_constrained_decoding), behind the existing gate-module interface (each gate already returns a verdict object — the seam is in place). Migrate gate-by-gate, token-grep kept as a shadow scorer during rollout.',
  },
  {
    name: 'ship review risk-scorer (keyword lists + LOC thresholds → tier)',
    paths: ['lib/ship/review-risk-scorer.js'],
    classification: 'KEEP',
    reasoning: 'The keyword override is a deliberate conservative FLOOR (security/schema words force deep review) — a cheap, auditable tripwire in front of the general method. The general method already exists downstream: the deep tier IS multi-agent adversarial review that scales with model capability. This pairing (hard floor + model-depth ceiling) is bitter-lesson-aligned, not a violation.',
    capability_trigger: 'If keyword lists start gating IN (skipping review on absence) rather than gating UP, reclassify — floors may bias conservative only.',
    replacement_spec: null,
  },
  {
    name: 'prompt templates with model-version-specific behavioral advice (CLAUDE*.md "Opus 4.8 interprets literally", per-model nudges)',
    paths: ['CLAUDE*.md via generate-claude-md-from-db.js', 'leo_protocol_sections'],
    classification: 'PARAMETERIZE',
    reasoning: 'Protocol text hard-embeds observations about a SPECIFIC model generation. Correct today, silently wrong after the next fleet-default change — the doc keeps steering workers around a model that is no longer driving.',
    capability_trigger: 'Fleet default model change (the Claude 5 family rollout is live now).',
    replacement_spec: 'Key model-behavior advice lines in leo_protocol_sections by model-family tag; the generator emits only lines matching the session model family. Longer term: self-tuned prompt variants scored by gate pass-rate (general method leveraging the reward spine).',
  },
  {
    name: 'liveness/dormancy heuristics (headless-zombie detection, dormancy watchdog thresholds, WORKER_SIGNAL:STUCK auto-thresholds)',
    paths: ['scripts/stale-session-sweep.cjs', 'scripts/worker-checkin.cjs'],
    classification: 'PARAMETERIZE',
    reasoning: 'Detection CONCEPTS are structural (a session with a live PID and no heartbeat is a real state), but the numeric thresholds are hand-tuned to today\'s tick cadence and known to over-fire (reference_threshold_autosignal_stuck_overfire; process_alive_at freezes on Windows). Threshold values belong in config with per-signal calibration, not inline literals.',
    capability_trigger: 'Reward-spine L2 outcome data accumulating enough to auto-calibrate thresholds per signal (learned, not hand-tuned).',
    replacement_spec: 'Extract threshold literals to a config block; follow-up carrier calibrates from false-positive history already logged in session telemetry.',
  },
  {
    name: 'red-merge blame attribution (COUNT-based, not identity-based)',
    paths: ['red-merge-detector (sweep pass)'],
    classification: 'REPLACE_WITH_GENERAL',
    reasoning: 'Known false-QF source (reference_red_merge_detector_count_vs_identity_false_qfs): correlation-by-count hand-heuristic blames whatever merged nearest the red signal. Attribution is exactly the kind of judgment models do better than counters.',
    capability_trigger: 'Already tractable — a fast model reading the failed CI step + the candidate diffs assigns blame with evidence; blocked only by wiring effort, not capability.',
    replacement_spec: 'Identity-based attribution: fetch the actually-failed step (reference_ci_red_verify_failed_step_not_log_string), candidate SHAs, and let a fast-model judge emit {blamed_sha, confidence, evidence} with constrained decoding; COUNT heuristic demoted to tie-breaker.',
  },
  {
    name: 'effort stamping (static effort-per-work-type recommendation at dispatch)',
    paths: ['lib/coordinator/dispatch.cjs (stampEffortRecommendation)'],
    classification: 'PARAMETERIZE',
    reasoning: 'Work-type→effort is a static table encoding today\'s intuition; as models strengthen, the same work needs less effort — a hand-tuned table silently overpays forever.',
    capability_trigger: 'Reward-spine outcome layers (gate pass-rate vs effort spent) reaching enough volume to fit effort-per-type from data.',
    replacement_spec: 'Table moves to config now; follow-up carrier replaces static values with rolling percentile from completed-SD telemetry.',
  },
  {
    name: 'model config canonical seam (per-provider role→model map)',
    paths: ['lib/config/model-config.js'],
    classification: 'KEEP',
    reasoning: 'This IS the parameterization seam the rest of the audit routes model knowledge INTO — a single, env-overridable, documented map. Its documented pins (solomon opus-4-8, generation downgrade) carry REVISIT-IF tags with named re-decision triggers instead of silent staleness.',
    capability_trigger: 'n/a — the seam itself is the durable structure; individual pins carry their own triggers via tags.',
    replacement_spec: null,
  },
];

// ── (b) Workaround sweep families (patterns disclosed; counts computed live) ──
const SWEEP_FAMILIES = [
  { family: 'bug-id references in comments', pattern: '(QF-\\d|RCA |harness bug|fb:[0-9a-f]{8})' },
  { family: 'workaround/interim markers', pattern: '(workaround|WORKAROUND|interim path|stopgap|band-aid)' },
  { family: 'retry/fallback shims', pattern: '(fallback to|retry shim|best-effort|fail-open)' },
  { family: 'version/model pins with reasons', pattern: '(pinned to|pin |downgraded from|Downgraded from)' },
  { family: 'REVISIT-IF tags (this SD grammar)', pattern: 'REVISIT-IF\\(' },
];

// ── (c) Model-ID exclusion taxonomy (RISK R7b: define BEFORE filing QFs) ─────
// Pattern requires a version/digit segment: claude-md, claude-sessions,
// claude-review-config.yml are file/table names, not model IDs.
const MODEL_ID_PATTERN = /(claude-(?:opus|sonnet|haiku|fable)[a-z0-9.-]*|claude-[0-9][a-z0-9.-]*|gpt-[0-9][a-z0-9.]*|gemini-[0-9][a-z0-9.-]+)/g;
const TAXONOMY = [
  { bucket: 'seam', test: (p) => p === 'lib/config/model-config.js', why: 'the canonical seam itself' },
  { bucket: 'excluded:pricing_cost', test: (p) => /(pricing|cost|token.*track|budget)/i.test(p), why: 'per-model rate data IS the job' },
  { bucket: 'excluded:registry_router', test: (p) => /(canary-router|client-factory|model-registry|multimodal-client|provider-rotation|model-selector|llm\/)/i.test(p), why: 'per-model routing/registry/construction IS the job' },
  { bucket: 'excluded:migration', test: (p) => p.startsWith('database/migrations/'), why: 'historical DDL, immutable' },
  { bucket: 'excluded:archive_example', test: (p) => /(^|\/)(archive|examples?|__tests__|tests?|fixtures|docs)\//.test(p) || p.startsWith('docs/'), why: 'non-runtime reference material' },
  { bucket: 'excluded:oneoff_nonruntime', test: (p) => p.startsWith('scripts/one-off/'), why: 'point-in-time tools, not continuously-running surface' },
  { bucket: 'excluded:agent_alias_namespace', test: (p) => p.endsWith('.partial') || p.startsWith('.claude/agents'), why: 'Claude Code alias namespace, not provider IDs (PAT-AUTO-83731782)' },
  { bucket: 'excluded:colocated_test', test: (p) => /\.test\.(m?c?js|ts)$/.test(p), why: 'test file co-located outside tests/ — no runtime surface' },
  { bucket: 'excluded:content_literal', test: (p) => p.startsWith('scripts/modules/sd-creation/') || p.startsWith('scripts/sql/'), why: 'model names embedded in generated document/seed TEXT (PRD content, SQL seeds), not dispatch' },
  { bucket: 'excluded:experiment_harness', test: (p) => /(j2a-model-tier-experiment|llm-audit|track-model-usage)/.test(p), why: 'model comparison/usage-audit tooling — per-model data IS the job' },
];
const DOCUMENTED_PIN_MARKER = 'REVISIT-IF(';
const isCommentLine = (line) => { const t = line.trim(); return t.startsWith('//') || t.startsWith('*') || t.startsWith('#') || t.startsWith('--'); };

function walk(relDir, results) {
  let entries;
  try { entries = readdirSync(join(REPO_ROOT, relDir), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (['node_modules', '.git', '.worktrees', 'coverage', 'dist', 'build'].includes(e.name)) continue;
    const rel = `${relDir}/${e.name}`;
    if (e.isDirectory()) walk(rel, results);
    else if (/\.(m?c?js|ts|sql|ya?ml|sh|ps1|partial)$/.test(e.name)) results.push(rel);
  }
}

function runSweeps(files) {
  const familyHits = SWEEP_FAMILIES.map((f) => ({ ...f, hits: 0, files: 0 }));
  const modelIdHits = [];
  for (const rel of files) {
    let content;
    try { content = readFileSync(join(REPO_ROOT, rel), 'utf8'); } catch { continue; }
    for (const fh of familyHits) {
      const m = content.match(new RegExp(fh.pattern, 'g'));
      if (m) { fh.hits += m.length; fh.files += 1; }
    }
    // Comment-line mentions change no runtime behavior — bucketed separately.
    const codeIds = new Set(); const commentIds = new Set();
    for (const line of content.split('\n')) {
      const m = line.match(MODEL_ID_PATTERN);
      if (m) m.forEach((id) => (isCommentLine(line) ? commentIds : codeIds).add(id));
    }
    if (codeIds.size || commentIds.size) {
      modelIdHits.push({ path: rel, ids: [...codeIds], commentOnlyIds: [...commentIds].filter((id) => !codeIds.has(id)), hasPinTag: content.includes(DOCUMENTED_PIN_MARKER) });
    }
  }
  return { familyHits, modelIdHits };
}

function bucketModelIds(modelIdHits) {
  const rows = [];
  for (const hit of modelIdHits) {
    const rule = TAXONOMY.find((t) => t.test(hit.path));
    let bucket = rule ? rule.bucket : null;
    let detail = rule ? rule.why : null;
    if (!bucket) {
      if (!hit.ids.length) { bucket = 'excluded:comment_reference'; detail = 'IDs appear only in comments — no runtime behavior'; }
      else if (hit.hasPinTag) { bucket = 'documented_pin'; detail = 'carries a REVISIT-IF tag naming the re-decision trigger'; }
      else { bucket = 'violation_candidate'; detail = 'provider model ID on a CODE line outside seam+taxonomy with no documented-pin tag — manual confirm before QF'; }
    }
    rows.push({ path: hit.path, ids: hit.ids.length ? hit.ids : hit.commentOnlyIds, bucket, detail });
  }
  return rows;
}

async function persist(ledger) {
  const { createRequire } = await import('node:module');
  const require2 = createRequire(import.meta.url);
  require2('dotenv').config({ path: join(REPO_ROOT, '.env') });
  const { createSupabaseServiceClient } = require2(join(REPO_ROOT, 'lib', 'supabase-client.cjs'));
  const sb = createSupabaseServiceClient();
  const { data: sd, error } = await sb.from('strategic_directives_v2').select('id, metadata').eq('sd_key', SOURCE_SD).maybeSingle();
  if (error || !sd) throw new Error('source SD read failed: ' + (error?.message || 'not found'));
  const { error: upErr } = await sb.from('strategic_directives_v2')
    .update({ metadata: { ...sd.metadata, bitter_lesson_ledger: ledger } }).eq('id', sd.id);
  if (upErr) throw new Error('ledger persist failed: ' + upErr.message);
  console.log('✓ metadata.bitter_lesson_ledger persisted');
}

function renderDoc(ledger) {
  const L = ['# Bitter-Lesson Ledger — harness heuristics + workaround expiry', '',
    `> Source: \`${SOURCE_SD}\` · rev \`${ledger.params.source_commit.slice(0, 12)}\` · generated ${ledger.params.generated_at}`,
    '> DB-first truth: `metadata.bitter_lesson_ledger` on the source SD. Regenerate: `node scripts/one-off/bitter-lesson-audit.mjs --execute`.',
    '> Sweep coverage is DISCLOSED, not closed: truly-silent workarounds are grep-invisible by definition — the families below say exactly what was searched.', '',
    '## Component classifications', '',
    '| Component | Classification | Capability trigger |', '|---|---|---|'];
  for (const c of ledger.components) L.push(`| ${c.name} | **${c.classification}** | ${c.capability_trigger} |`);
  L.push('', '### Reasoning + replacement specs', '');
  for (const c of ledger.components) {
    L.push(`**${c.name}** (\`${c.classification}\`)`, '', c.reasoning, '');
    if (c.replacement_spec) L.push(`*Replacement spec:* ${c.replacement_spec}`, '');
  }
  L.push('## REVISIT-IF tag grammar', '', '```', 'REVISIT-IF(<condition>) owner=<role> provenance=<SD/QF/ref> [note=<premise>]', '  condition: expires=YYYY-MM-DD (machine-evaluable) | free text (inventoried)', '```', '',
    `Tag inventory: ${ledger.tags.total_tags} tags (${ledger.tags.healthy} healthy, ${ledger.tags.non_evaluable_inventory} non-evaluable, ${ledger.tags.expired_count} expired, ${ledger.tags.orphaned_count} orphaned). Gauge: \`expired-premise-tags\` in lib/governance/gauge-registry.js (weekly via gauge-runner).`, '',
    '## Workaround sweep families (disclosed coverage)', '', '| Family | Pattern | Hits | Files |', '|---|---|---|---|');
  for (const f of ledger.sweep_families) L.push(`| ${f.family} | \`${f.pattern}\` | ${f.hits} | ${f.files} |`);
  L.push('', '## Model-ID bucket table', '', '| Bucket | Files |', '|---|---|');
  const byBucket = {};
  for (const r of ledger.model_id_buckets) (byBucket[r.bucket] ||= []).push(r.path);
  for (const [bucket, paths] of Object.entries(byBucket)) L.push(`| ${bucket} | ${paths.length} |`);
  const cands = ledger.model_id_buckets.filter((r) => r.bucket === 'violation_candidate');
  L.push('', cands.length ? `### Violations — filed as ${ledger.violation_qf} (aggregate; triage escalates if > QF tier)` : '### No violation candidates outside the taxonomy', '');
  for (const c of cands) L.push(`- \`${c.path}\` — ${c.ids.join(', ')}`);
  const docPath = join(REPO_ROOT, 'docs', 'reference', 'bitter-lesson-ledger.md');
  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, L.join('\n') + '\n');
  console.log('✓ doc written:', docPath);
}

function assertCommentOnly() {
  const TAGGED = ['lib/fleet/door-constants.cjs', 'lib/coordinator/dispatch.cjs', 'lib/config/model-config.js'];
  // Two-dot against origin/main: covers the WORKING TREE too, so the assertion
  // is meaningful pre-commit (three-dot ...HEAD sees only committed changes and
  // passes vacuously on uncommitted tags).
  const diff = execSync(`git diff origin/main -- ${TAGGED.join(' ')}`, { cwd: REPO_ROOT, encoding: 'utf8' });
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  const nonComment = added.filter((l) => { const s = l.slice(1).trim(); return s !== '' && !s.startsWith('//') && !s.startsWith('#') && !s.startsWith('*'); });
  if (nonComment.length) {
    console.error('✗ COMMENT-ONLY ASSERTION FAILED — non-comment added lines in tagged files:');
    nonComment.forEach((l) => console.error('  ', l));
    process.exit(1);
  }
  console.log(`✓ comment-only assertion: ${added.length} added lines in ${TAGGED.length} tagged files, all comments`);
}

(async () => {
  if (ASSERT_COMMENTS) { assertCommentOnly(); return; }
  const files = [];
  for (const dir of ['lib', 'scripts', 'database', '.claude/agents']) walk(dir, files);
  const { familyHits, modelIdHits } = runSweeps(files);
  const tags = detectExpiredPremises(REPO_ROOT, { now: new Date() });
  const ledger = {
    params: {
      source_commit: execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
      generated_at: new Date().toISOString(),
      scanned_files: files.length,
      method_limits: 'grep-family sweep; truly-silent workarounds (no textual marker) are invisible to this method — coverage is the disclosed families only',
    },
    components: COMPONENTS,
    sweep_families: familyHits,
    // AC-4: violations are QF-filed AND ledger-cross-listed. One aggregate QF
    // (not 22 — RISK R7b anti-flood), carrying the full file list; triage
    // escalates to SD if it exceeds QF tier.
    violation_qf: 'QF-20260705-350',
    tags: { total_tags: tags.total_tags, healthy: tags.healthy, non_evaluable_inventory: tags.non_evaluable_inventory, expired_count: tags.expired.length, orphaned_count: tags.orphaned.length },
    model_id_buckets: bucketModelIds(modelIdHits),
  };
  const unresolved = COMPONENTS.filter((c) => !['KEEP', 'REPLACE_WITH_GENERAL', 'PARAMETERIZE'].includes(c.classification));
  console.log(`components: ${COMPONENTS.length} classified, ${unresolved.length} unresolved`);
  console.log('sweep families:', familyHits.map((f) => `${f.family}=${f.hits}`).join(' | '));
  console.log(`tags: ${tags.total_tags} total, ${tags.expired.length} expired, ${tags.orphaned.length} orphaned, ${tags.malformed.length} malformed`);
  const buckets = bucketModelIds(modelIdHits);
  const counts = buckets.reduce((a, r) => ((a[r.bucket] = (a[r.bucket] || 0) + 1), a), {});
  console.log('model-id buckets:', JSON.stringify(counts));
  if (!EXECUTE) { console.log('(dry run — --execute to persist + render)'); return; }
  await persist(ledger);
  renderDoc(ledger);
})();
