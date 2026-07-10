/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: --from-proposal / --proposal-b64 / --proposal-stdin ingest
 * lanes, moved VERBATIM from scripts/leo-create-sd.js. Lives under scripts/ (NOT
 * lib/sd-creation) on purpose: tests/unit/leo-create-sd-from-proposal.test.js and
 * leo-create-sd-proposal-metadata-preserve.test.js behaviorally pin process.exit(1) on
 * invalid proposals, so the fail-loud exits stay — the lib/sd-creation no-process.exit
 * invariant does not apply here. scripts/leo-create-sd.js re-exports every public name.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, basename, join as joinPath } from 'node:path';
import { keyExists } from '../sd-key-generator.js';
import { checkPremiseLiveness } from '../../../lib/eva/premise-liveness.js';
import { mapToDbType, createSD as pipelineCreateSD } from '../../../lib/sd-creation/pipeline.js';
import { parseTargetReposArg } from './target-repos.js';

/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: default createSD dependency for ingestProposalObject.
 * Preserves the PRE-refactor process contract of this route exactly: the pipeline's former
 * early-exit(0) paths (QF-prefix redirect) exit 0, its former exit(1) paths (guardrail /
 * cascade violations) exit 1, and an insert failure THROWS (as createSD always did for this
 * route) so callers' catch blocks see the same "Failed to create SD: ..." error.
 */
async function createSDWithCliExits(args) {
  const res = await pipelineCreateSD(args);
  if (res.ok === true && res.done === true) process.exit(res.exitCode ?? 0);
  if (res.ok === false) {
    if (res.code === 'INSERT_FAILED') throw new Error(res.error);
    process.exit(res.exitCode ?? 1);
  }
  return res.sd;
}

// ============================================================================
// --from-proposal ingest (SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001)
// Materialize .prd-payloads/PROPOSAL-*.json into DRAFT SDs via the EXISTING
// createSD() path. Critical divergence from --from-plan: the key is taken
// VERBATIM from proposed_sd_key (no generateSDKey / archive / content-hash).
// validateProposalShape + mapProposalToCreateArgs are PURE + exported so unit
// tests exercise them with zero DB access; createFromProposal accepts injected
// deps {keyExists, createSD, readFile, resolveFiles} so dry-run + idempotency
// are testable without the (non-injectable, module-singleton) live supabase.
// ============================================================================

const VALID_PROPOSAL_PRIORITIES = ['critical', 'high', 'medium', 'low'];

/**
 * Validate a parsed proposal object fail-loud. Required: proposed_sd_key, title,
 * sd_type, priority (+ PROPOSAL===true, status_intended==='draft' when present).
 * sd_type is validated by reusing mapToDbType() (canonical 15-value enum, throws);
 * priority is lowercased + checked against the 4-value set. On any failure: a
 * bracket-tokenized console.error + process.exit(1). Returns the normalized core.
 * @param {object} proposal
 * @param {string} filePath
 * @returns {{sdKey:string,title:string,type:string,priority:string,rawType:string}}
 */
export function validateProposalShape(proposal, filePath) {
  const where = filePath || '<proposal>';
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    console.error(`[INVALID_PROPOSAL] ${where}: payload must be a JSON object`);
    process.exit(1);
  }
  if (proposal.PROPOSAL !== true) {
    console.error(`[INVALID_PROPOSAL] ${where}: not a proposal (expected "PROPOSAL": true)`);
    process.exit(1);
  }
  if (proposal.status_intended != null && proposal.status_intended !== 'draft') {
    console.error(`[INVALID_PROPOSAL] ${where}: status_intended must be "draft" (got ${JSON.stringify(proposal.status_intended)})`);
    process.exit(1);
  }
  // Required fields must be non-empty STRINGS. The typeof check is load-bearing:
  // without it a number/boolean/array/object (e.g. title:[] or proposed_sd_key:42)
  // would pass and flow verbatim into createSD -> a corrupt INSERT or an uncaught
  // TypeError at sdKey.startsWith. (adversarial review w2b0qjnoa, 2 HIGH findings)
  for (const field of ['proposed_sd_key', 'title', 'sd_type', 'priority']) {
    const v = proposal[field];
    if (v === undefined || v === null || typeof v !== 'string' || v.trim() === '') {
      console.error(`[INVALID_PROPOSAL] ${where}: required field "${field}" must be a non-empty string`);
      process.exit(1);
    }
  }
  let type;
  try {
    type = mapToDbType(proposal.sd_type); // reuses canonical enum; throws on invalid (now guaranteed a string)
  } catch (e) {
    console.error(`[INVALID_PROPOSAL_SD_TYPE] ${where}: ${e.message}`);
    process.exit(1);
  }
  // priority is guaranteed a non-empty string by the loop above, so a single-element
  // array like ['high'] can no longer String()-coerce through this check.
  const priority = proposal.priority.toLowerCase();
  if (!VALID_PROPOSAL_PRIORITIES.includes(priority)) {
    console.error(`[INVALID_PROPOSAL_PRIORITY] ${where}: "${proposal.priority}". Valid: ${VALID_PROPOSAL_PRIORITIES.join(', ')}`);
    process.exit(1);
  }
  return { sdKey: proposal.proposed_sd_key, title: proposal.title, type, priority, rawType: proposal.sd_type };
}

/**
 * Map a validated proposal to createSD() args. Key is verbatim; description falls
 * back rationale -> scope -> title; metadata.source='proposal' + provenance.
 * No vision_key/arch_key (avoids enrichFromVisionArch orphan-FK), no parentId,
 * no orchestrator auto-routing. PURE.
 *
 * SD-LEO-INFRA-ADAM-SELF-AUDIT-RESOLVERS-001 (FR-1a, load-bearing): stamp the CANONICAL
 * Adam-sourced marker `metadata.sourced_by='adam'` ONLY when the proposal carries the
 * explicit, opt-in `sourced_by: 'adam'` field. This is the durable attribution the
 * sourcing-cadence probe counts (resolveFacts.sourcedInWindow). The marker is opt-in by
 * design: a non-Adam proposal (e.g. drain-intake, which sets provenance.source='drain-intake'
 * but never sourced_by) is left UN-stamped, so non-Adam creation paths are unchanged.
 * The closed-whitelist metadata invariant is preserved — the key only appears when the
 * proposal explicitly declares Adam origin.
 *
 * WHERE THIS FIRES (canonical Adam sourcing path — NOT a no-op): mapProposalToCreateArgs is the
 * single mapper for ingestProposalObject(), which is the shared core of Adam's FILE-FREE DB-direct
 * sourcing routes `--proposal-b64` and `--proposal-stdin` (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001),
 * plus `--from-proposal`. Those routes ARE the intended forward producer of Adam's sourcing: an Adam
 * session emits a proposal JSON carrying `sourced_by:'adam'`, and this line is the ONLY code path
 * that stamps the canonical marker. So FR-1b's consumer count (resolveFacts.sourcedInWindow) relies
 * on a real producer, not a phantom one.
 *
 * Live-state note (verified 2026-06-15): the ~31 existing strategic_directives_v2 rows already
 * carrying metadata.sourced_by='adam' have source=leo|plan|feedback (NOT proposal) and were stamped
 * by Adam's earlier DB-direct sourcing (manual metadata write), since no other CODE producer stamps
 * sourced_by. Those historical rows are still counted by FR-1b as-is; this stamp makes the
 * proposal-based routes the durable, code-enforced producer going forward. No retroactive change.
 */
// SD-LEO-INFRA-FROM-PROPOSAL-METADATA-PRESERVE-001 (FR-1): keys DELIBERATELY excluded from the
// preserved proposal metadata, for two reasons:
//   (a) LEAK-GUARD — arch_key/vision_key drive enrichFromVisionArch's orphan-FK re-activation
//       (see mapProposalToCreateArgs header + the createSD vision/arch enrichment path).
//   (b) CANONICAL-AUTHORITATIVE — these keys have dedicated, guarded handling below that must
//       stay the single source of truth. The review-attestation flags (migration_reviewed /
//       security_reviewed) are security-sensitive: they may appear ONLY on an explicit `=== true`,
//       so a preserved raw `false`/`null`/object value must NOT leak through. target_repos is
//       translated to target_application + a normalized list; depends_on is normalized into the
//       canonical dependencies column + a back-compat metadata copy.
const PROPOSAL_META_DROP_KEYS = new Set([
  'arch_key', 'vision_key',
  'migration_reviewed', 'security_reviewed',
  'target_repos', 'depends_on',
]);

export function mapProposalToCreateArgs(normalized, proposal, filePath, opts = {}) {
  // FR-1: preserve the proposal's full metadata object (merge with canonical defaults rather than
  // replacing), MINUS the leak-guard keys. This carries Adam-sourcing keys (min_tier_rank,
  // requires_human_action, deferred/deferred_until, etc.) that the old closed whitelist dropped.
  const preservedProposalMeta = {};
  if (proposal.metadata && typeof proposal.metadata === 'object' && !Array.isArray(proposal.metadata)) {
    for (const [k, v] of Object.entries(proposal.metadata)) {
      if (!PROPOSAL_META_DROP_KEYS.has(k)) preservedProposalMeta[k] = v;
    }
  }

  // FR-2/FR-4: translate metadata.target_repos -> canonical target_application (first repo is the
  // primary; the full list stays in metadata.target_repos). Reuse the --target-repos validator
  // (parseTargetReposArg validates against ALLOWED_REPOS and exits(1) on an invalid value).
  const proposalTargetRepos = Array.isArray(proposal.metadata?.target_repos) && proposal.metadata.target_repos.length > 0
    ? parseTargetReposArg(proposal.metadata.target_repos.join(','))
    : null;

  return {
    sdKey: normalized.sdKey,
    title: normalized.title,
    type: normalized.type,
    priority: normalized.priority,
    // SD-REFILL-00229BH8: lead the DESCRIPTION with the OBJECTIVE (scope), not the rationale.
    // proposal.rationale frequently carries provenance boilerplate ("Materialized from coordinator
    // proposal (idle-fleet vision-aligned design work)") whose purpose is the LEAD evaluator, NOT a
    // description — when it led the description, the substantive ~1500ch scope was buried and workers
    // mis-flagged the SD as an 8-word stub. scope (the objective) is preferred; rationale is the
    // fallback only when scope is absent. Provenance still lives in `rationale` + metadata below.
    description: proposal.scope || proposal.rationale || proposal.title,
    // Sibling parity: UAT/learn/feedback/QF/plan/child all set an explicit rationale
    // (used by the LEAD evaluator). Fall back to a provenance line when absent.
    rationale: proposal.rationale || `Materialized from proposal ${filePath || 'unknown'}`,
    scope: proposal.scope || null,
    success_criteria: Array.isArray(proposal.success_criteria) ? proposal.success_criteria : null,
    // SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-1): a proposal that declares
    // metadata.depends_on must populate the CANONICAL `dependencies` column — that is
    // what lib/coordinator/claimable-work.cjs and scripts/modules/sd-next/dependency-resolver.js
    // gate BLOCKED/READY on. metadata.depends_on alone is documented (Dependency Field Guide)
    // as ignored by the resolver, so the prior closed whitelist silently dropped child
    // sequencing — forcing manual ordering of the sourcing-engine children. Only set the
    // key when there is at least one normalized dep (preserves dependencies=[] otherwise).
    ...(normalizeDependsOn(proposal.metadata?.depends_on).length > 0
      ? { dependencies: normalizeDependsOn(proposal.metadata?.depends_on) }
      : {}),
    // FR-2: the primary target repo becomes the canonical top-level target_application that the
    // branch-resolver / gate / repo-path resolution read (mirrors the --target-repos flag path).
    ...(proposalTargetRepos ? { target_application: proposalTargetRepos[0] } : {}),
    metadata: {
      // FR-1: full proposal metadata preserved (minus leak-guard keys), then canonical defaults
      // below WIN over any same-named proposal key (source, provenance, validated target_repos, …).
      ...preservedProposalMeta,
      source: 'proposal',
      proposal_file_path: filePath || null,
      proposal_provenance: proposal.provenance || null,
      roadmap_phase: proposal.roadmap_phase || null,
      tier_hint: proposal.tier_hint || null,
      gold_origin: proposal.gold_origin || null,
      necessity: proposal.necessity || null,
      dedup_note: proposal.dedup_note || null,
      // SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-2): carry the proposal's informational
      // dependency/provenance keys through the closed whitelist. engine_child_index and
      // parent_sd_key are ordering/lineage hints the coordinator + reporting consume;
      // depends_on is retained in metadata for back-compat with any reader that still
      // inspects it (the ENFORCED copy lives in the dependencies column above). Each key
      // appears ONLY when the proposal declares it (no coercion/defaulting), preserving
      // the closed-whitelist metadata invariant.
      ...(proposal.metadata?.engine_child_index !== undefined && proposal.metadata?.engine_child_index !== null
        ? { engine_child_index: proposal.metadata.engine_child_index }
        : {}),
      ...(proposal.metadata?.parent_sd_key ? { parent_sd_key: proposal.metadata.parent_sd_key } : {}),
      ...(normalizeDependsOn(proposal.metadata?.depends_on).length > 0
        ? { depends_on: proposal.metadata.depends_on }
        : {}),
      // FR-1a: canonical Adam-origin attribution (the code-enforced producer for FR-1b's
      // sourcing-cadence consumer; see this function's doc comment). Only stamped for an explicit
      // Adam-origin proposal — never coerced/defaulted, so a non-Adam proposal stays unattributed.
      ...(proposal.sourced_by === 'adam' ? { sourced_by: 'adam' } : {}),
      // SD-LEO-INFRA-PROPOSAL-INGEST-REVIEW-FLAGS-001 (FR-1/FR-3): bring the proposal-ingest
      // route to PARITY with the direct-args route (~line 2989) for the review-attestation
      // flags. The attestation is stamped ONLY on an explicit `=== true` — from the proposal's
      // own metadata OR the threaded CLI flag (opts). NEVER coerced/defaulted: a 'true' string,
      // 1, false, or absence all leave the flag UNSET, so a genuinely-unreviewed governed
      // proposal is STILL blocked by GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE. This removes a
      // FALSE block (an already-reviewed proposal), it does NOT weaken the review gate.
      ...(proposal.metadata?.migration_reviewed === true || opts.migrationReviewed === true ? { migration_reviewed: true } : {}),
      ...(proposal.metadata?.security_reviewed === true || opts.securityReviewed === true ? { security_reviewed: true } : {}),
      // SD-LEO-INFRA-PROPOSAL-INGEST-ARCHPLAN-WHITELIST-001: propagate the orchestrator arch-plan
      // PRESENCE keys so GR-ORCHESTRATOR-ARCH-PLAN (a presence check on architecture_plan_ref ||
      // arch_plan_key || arch_key, guardrail-registry.js) passes for an orchestrator proposal that
      // carries a real plan. Without this the closed whitelist stripped them and the guardrail read
      // undefined → BLOCKED, so NO orchestrator proposal could materialize via --from-proposal (parity
      // gap vs the direct-args route + the review flags above). architecture_plan_ref / arch_plan_key /
      // architecture_plan are PURE metadata consumed by the guardrail + reporting — NOT routing keys.
      // CRITICAL: arch_key (and vision_key) are still DELIBERATELY dropped — they drive
      // enrichFromVisionArch's orphan-FK re-activation (see this fn's header + line ~2169); the two
      // ref/plan keys already satisfy the guardrail WITHOUT that risk, so the leak guard is preserved.
      // Each key appears ONLY when the proposal declares it (no coercion/defaulting).
      ...(proposal.metadata?.architecture_plan_ref ? { architecture_plan_ref: proposal.metadata.architecture_plan_ref } : {}),
      ...(proposal.metadata?.arch_plan_key ? { arch_plan_key: proposal.metadata.arch_plan_key } : {}),
      ...(proposal.metadata?.architecture_plan ? { architecture_plan: proposal.metadata.architecture_plan } : {}),
      // FR-2: keep the NORMALIZED/validated target_repos in metadata (overrides the raw preserved
      // value), parallel to the --target-repos flag path which stamps metadata.target_repos.
      ...(proposalTargetRepos ? { target_repos: proposalTargetRepos } : {}),
    },
  };
}

/**
 * SD-FDBK-INFRA-LEO-CREATE-PROPOSAL-001 (FR-1): normalize a proposal's declared
 * depends_on into the CANONICAL dependencies-column shape [{ sd_id: <key> }].
 * Accepts the same loose entry forms the dispatcher's depsArray() tolerates:
 *   - bare SD-key string            "SD-FOO-001"        -> { sd_id: "SD-FOO-001" }
 *   - { sd_id: "SD-FOO-001" }       (canonical)          -> passed through
 *   - { sd_key: "SD-FOO-001" }      (alias)              -> { sd_id: "SD-FOO-001" }
 * Non-string / empty / malformed entries are dropped (fail-soft — a bad dep entry
 * must never crash SD creation). Returns [] for any non-array / nullish input, so a
 * proposal without depends_on yields dependencies=[] (no behavior change). PURE.
 */
export function normalizeDependsOn(dependsOn) {
  if (!Array.isArray(dependsOn)) return [];
  const out = [];
  for (const entry of dependsOn) {
    let key = null;
    if (typeof entry === 'string') key = entry.trim();
    else if (entry && typeof entry === 'object') key = (entry.sd_id || entry.sd_key || '').trim();
    if (key) out.push({ sd_id: key });
  }
  return out;
}

/**
 * Resolve a path or simple glob (basename may contain '*') to a sorted file list.
 * Fail-loud if nothing matches / the file is missing.
 */
function resolveProposalFiles(pathOrGlob) {
  if (!pathOrGlob || typeof pathOrGlob !== 'string') {
    console.error('[INVALID_PROPOSAL] --from-proposal requires a file path or glob (e.g. .prd-payloads/PROPOSAL-*.json)');
    process.exit(1);
  }
  if (pathOrGlob.includes('*')) {
    const dir = dirname(pathOrGlob);
    const pat = basename(pathOrGlob);
    const rx = new RegExp('^' + pat.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    let entries;
    try { entries = readdirSync(dir); } catch (e) {
      console.error(`[INVALID_PROPOSAL] cannot read directory "${dir}": ${e.message}`);
      process.exit(1);
    }
    const matched = entries.filter(f => rx.test(f)).sort().map(f => joinPath(dir, f));
    if (matched.length === 0) {
      console.error(`[INVALID_PROPOSAL] no files match glob "${pathOrGlob}"`);
      process.exit(1);
    }
    return matched;
  }
  if (!existsSync(pathOrGlob)) {
    console.error(`[INVALID_PROPOSAL] file not found: "${pathOrGlob}"`);
    process.exit(1);
  }
  return [pathOrGlob];
}

/**
 * Per-proposal ingest CORE (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): given an
 * already-parsed proposal OBJECT and a string `source` label, run validateProposalShape
 * -> keyExists -> mapProposalToCreateArgs -> (dryRun ? report : createSD). Returns a
 * {sdKey, file, action} row. This is the SINGLE shared path for every ingest route
 * (file, --proposal-b64, --proposal-stdin) so they cannot drift. No FS/argv access here —
 * callers are responsible for materializing the proposal object.
 * @param {object} proposal — parsed proposal object
 * @param {string} source — provenance label (file path, '<proposal-b64>', '<proposal-stdin>')
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function}}} options
 */
export async function ingestProposalObject(proposal, source, options = {}) {
  const { dryRun = false, deps = {}, migrationReviewed = false, securityReviewed = false } = options;
  const _keyExists = deps.keyExists || keyExists;
  const _createSD = deps.createSD || createSDWithCliExits;
  // SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001 FR-2: injectable premise-liveness
  // stale-guard (defaults to the real checker; tests inject a stub).
  const _checkPremise = deps.checkPremiseLiveness || checkPremiseLiveness;

  const normalized = validateProposalShape(proposal, source);
  const exists = await _keyExists(normalized.sdKey);
  if (exists) {
    console.log(`⏭️  ${normalized.sdKey} already exists, skipping (${source})`);
    return { sdKey: normalized.sdKey, file: source, action: 'skipped' };
  }

  // SD-LEO-INFRA-PREMISE-LIVENESS-GATE-SOURCING-001 FR-2: re-verify diagnostic /
  // retro-mined premises at SOURCE so a premise already killed by a shipped fix does
  // not materialize (then get cancelled 4 stages later at worker verify-premise). The
  // guard runs ONLY when the proposal opts in via `premise_descriptor`; non-diagnostic
  // proposals are untouched. FAIL-SOFT: any checker error falls through to creation —
  // only a PROVABLY STALE premise is skipped (the checker itself defaults LIVE on doubt).
  if (proposal.premise_descriptor && typeof proposal.premise_descriptor === 'object') {
    try {
      const descriptor = { source, ...proposal.premise_descriptor };
      const verdict = await _checkPremise(descriptor, { supabase: deps.supabase });
      if (verdict && verdict.status === 'STALE') {
        console.log(`⏭️  ${normalized.sdKey} skipped — premise STALE (${verdict.recommendation}) (${source})`);
        for (const e of verdict.evidence || []) console.log(`      • ${e}`);
        return { sdKey: normalized.sdKey, file: source, action: 'skipped-stale', verdict };
      }
    } catch (e) {
      console.warn(`   ⚠️  Premise-liveness check skipped (non-blocking, fail-open): ${e?.message || e}`);
    }
  }
  // FR-2: forward the threaded review-attestation flags (from --migration-reviewed /
  // --security-reviewed on the proposal-ingest CLI routes) to the mapper, which honors them
  // ONLY on an explicit `=== true` (FR-3 guard lives in mapProposalToCreateArgs).
  const args = mapProposalToCreateArgs(normalized, proposal, source, { migrationReviewed, securityReviewed });
  if (dryRun) {
    console.log(`🔎 [dry-run] would create ${args.sdKey} (${args.type}/${args.priority}) — ${args.title}`);
    return { sdKey: normalized.sdKey, file: source, action: 'dry-run' };
  }
  await _createSD(args);
  console.log(`✅ Created DRAFT SD ${args.sdKey} from ${source}`);
  return { sdKey: normalized.sdKey, file: source, action: 'created' };
}

/**
 * --from-proposal ingest: read PROPOSAL-*.json file(s), validate, and create a
 * DRAFT SD per file via the shared ingestProposalObject() core (verbatim key).
 * Idempotent (skips an already-materialized key). --dry-run validates + reports,
 * zero writes.
 * @param {string} pathOrGlob
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function, readFile?:Function, resolveFiles?:Function}}} options
 */
export async function createFromProposal(pathOrGlob, options = {}) {
  const { deps = {} } = options;
  const _readFile = deps.readFile || readFileSync;
  const _resolveFiles = deps.resolveFiles || resolveProposalFiles;

  const files = _resolveFiles(pathOrGlob);
  const results = [];
  for (const file of files) {
    let raw, proposal;
    try {
      raw = _readFile(file, 'utf8');
    } catch (e) {
      console.error(`[INVALID_PROPOSAL] ${file}: cannot read file: ${e.message}`);
      process.exit(1);
    }
    try {
      proposal = JSON.parse(raw);
    } catch (e) {
      console.error(`[INVALID_PROPOSAL] ${file}: invalid JSON: ${e.message}`);
      process.exit(1);
    }
    // Delegate to the shared core; the whole `options` (dryRun + deps) carries through.
    results.push(await ingestProposalObject(proposal, file, options));
  }
  return results;
}

/**
 * --proposal-b64 ingest (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): base64-decode a
 * proposal JSON and route the OBJECT through ingestProposalObject(). FILE-FREE — lets an
 * operator-attached session (Adam/coordinator) on main source a DRAFT SD without writing
 * a payload file (which the worktree-hygiene Write guard blocks). base64-on-the-wire is
 * PREFERRED over a raw --proposal-json argv flag because it is immune to the Bash
 * single-quote mangling that defeats inline JSON. Buffer.from(.,'base64') is lenient
 * (never throws on junk — it drops out-of-alphabet bytes), so the post-decode JSON.parse
 * is the load-bearing validator that fails loud on garbage input.
 * @param {string} b64
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function}}} options
 */
export async function createFromProposalB64(b64, options = {}) {
  if (!b64 || typeof b64 !== 'string') {
    console.error('[INVALID_PROPOSAL] --proposal-b64 requires a base64-encoded proposal JSON string');
    process.exit(1);
  }
  const raw = Buffer.from(b64, 'base64').toString('utf8');
  let proposal;
  try {
    proposal = JSON.parse(raw);
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-b64: invalid JSON after base64 decode: ${e.message}`);
    process.exit(1);
  }
  return [await ingestProposalObject(proposal, '<proposal-b64>', options)];
}

/**
 * Read all of process.stdin as a UTF-8 string (resolves on 'end'). Extracted so
 * --proposal-stdin can inject a fake reader in unit tests (no real pipe needed).
 */
function readStdinUtf8() {
  return new Promise((resolve, reject) => {
    // No piped input (interactive TTY): 'end' would never fire and the process would
    // hang until Ctrl-C. Fail loud instead — the caller surfaces [INVALID_PROPOSAL].
    if (process.stdin.isTTY) {
      reject(new Error('stdin is a TTY (no piped proposal JSON)'));
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * --proposal-stdin ingest (SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001): read a proposal
 * JSON from stdin and route the OBJECT through ingestProposalObject(). FILE-FREE
 * pipe-based counterpart to --proposal-b64. The stdin reader is injectable
 * (deps.readStdin) so tests need no real pipe. Fails loud on empty stdin / invalid JSON.
 * @param {{dryRun?:boolean, deps?:{keyExists?:Function, createSD?:Function, readStdin?:Function}}} options
 */
export async function createFromProposalStdin(options = {}) {
  const { deps = {} } = options;
  const _readStdin = deps.readStdin || readStdinUtf8;
  let raw;
  try {
    raw = await _readStdin();
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-stdin: cannot read stdin: ${e.message}`);
    process.exit(1);
  }
  if (!raw || !raw.trim()) {
    console.error('[INVALID_PROPOSAL] --proposal-stdin: empty stdin (expected a proposal JSON on stdin)');
    process.exit(1);
  }
  let proposal;
  try {
    proposal = JSON.parse(raw);
  } catch (e) {
    console.error(`[INVALID_PROPOSAL] --proposal-stdin: invalid JSON: ${e.message}`);
    process.exit(1);
  }
  return [await ingestProposalObject(proposal, '<proposal-stdin>', options)];
}
