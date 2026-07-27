#!/usr/bin/env node
/**
 * One-off: Write SECURITY sub-agent EXEC-TO-PLAN evidence for
 * SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E ("Measurement provenance: stamp
 * perishability onto the existing premise-liveness path").
 *
 * Post-implementation security review of the committed diff (16adbbd210a):
 *   lib/governance/measurement-provenance.js (new)
 *   lib/governance/emit-feedback.js (spread-last provenance stamping)
 *   lib/eva/feedback-premise-adapter.js (additive provenance carry-through)
 *   scripts/create-quick-fix.js (STALE_PREMISE console.error provenance print)
 *
 * Canonical repo-evidence + storage pattern per the sibling TESTING PLAN-TO-EXEC
 * evidence script in this directory.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e74cd20f-02b7-4142-aee7-e443421efb7d';
const SD_KEY = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E';

const findings = [
  {
    id: 'S1-command-injection-not-reachable',
    severity: 'INFO',
    summary: 'lib/governance/measurement-provenance.js:24 defaultGit(argsString) runs execSync(`git ${argsString}`) — a template-interpolated shell string, which is the injection-prone shape in general. Reachability check: the ONLY call site of buildMeasurementProvenance() in production code is lib/governance/emit-feedback.js:131 (`...buildMeasurementProvenance(provenanceDeps)`), which is invoked with either an empty object (default `git = defaultGit`) or a caller-supplied `provenanceDeps` (emitFeedback param at emit-feedback.js:188, emitFeedbackBatch shared.provenanceDeps at :428). Grep confirms zero production callers pass anything into provenanceDeps.git today; every call in the diff and in lib/governance/emit-feedback.js is either omitted or wired from test fixtures. Inside buildMeasurementProvenance itself (measurement-provenance.js:63-67, 76-77) argsString is invoked with exactly two hardcoded string literals — \'rev-parse HEAD\' and \'rev-parse --abbrev-ref HEAD\' — never a variable built from request/DB/user data. No caller-controlled value reaches argsString through any currently-wired path. NOT exploitable today.'
  },
  {
    id: 'S1b-mirrors-pre-existing-convention-no-widened-exposure',
    severity: 'INFO',
    summary: 'lib/eva/premise-liveness.js:35-37 already has the identical execSync(`git ${argsString}`) shape and has shipped in production since before this SD (confirmed by direct read: `function defaultGit(argsString) { try { return execSync(`git ${argsString}`, ...` at :35-37). measurement-provenance.js:defaultGit is a same-shape sibling, not a novel exposure — it does not widen the attack surface because (a) it is called from a different, equally-non-attacker-facing site (emitFeedback, an internal governance write path invoked by backend cron jobs / CLI scripts / lifecycle bridges — grep of callers shows watchdogs, lifecycle-sd-bridge.js, capture-completion-flags.js, log-harness-bug.js, none of which are HTTP-request-driven with attacker-supplied argv), and (b) its own args are always the two hardcoded literals above. Recommendation: execFileSync(\'git\', [\'rev-parse\', \'HEAD\']) with an argv array is still stylistically preferable defense-in-depth (removes the shell-string class entirely, matches OWASP guidance for subprocess invocation) but is NOT a blocker for this SD — it is a proportionate follow-on hardening item for BOTH measurement-provenance.js and its pre-existing sibling premise-liveness.js together, since fixing only the new file while leaving the identical pattern in the old one would be inconsistent. Recommend a small follow-up QF, not a NO-GO on this SD.'
  },
  {
    id: 'S2-git-ref-disclosure-low-severity',
    severity: 'LOW',
    summary: 'git_sha and git_ref (branch name) are now persisted into feedback.metadata (emit-feedback.js:131) and printed to the console on a STALE refusal (create-quick-fix.js: the two `console.error` lines added after the STALE_PREMISE block print `prov.git_ref` and `prov.git_sha.slice(0,12)`). Neither value is a secret: git_sha is a content-addressed commit hash already visible to anyone with repo access (git log/GitHub), and git_ref is the checked-out branch name of the *machine running the CLI tool* — an internal developer/CI workstation in this repo, not a value derived from external user input. A branch name COULD theoretically be named after a customer or contain an embedded token if a developer chose to name it that way, but that is a pre-existing branch-naming-hygiene concern orthogonal to this change (the same string is already visible via `git branch`, `git status`, CI logs, and GitHub PR URLs for anyone with repo access). This SD does not create a new disclosure channel — it duplicates an already-visible value into an internal governance table + an internal CLI operator\'s own terminal. Not a blocking concern; realistic severity LOW (hygiene, not exposure).'
  },
  {
    id: 'S3-log-injection-low-risk-not-blocking',
    severity: 'LOW',
    summary: 'emit-feedback.js:150 documents "Per security-agent C-SEC-3B (log-injection defense)" for TITLE/DESCRIPTION fields specifically (user-submitted SD title / venture name must never be string-interpolated into fields that get logged/rendered). The NEW console.error lines in create-quick-fix.js interpolate prov.measured_at / prov.git_ref / prov.git_sha, which are read from a DB row\'s metadata jsonb (fb.metadata, fetched by id at create-quick-fix.js\'s freshFb query). Two of the three values are NOT attacker-reachable in practice: measured_at is always produced by `new Date().toISOString()` at measurement-provenance.js:39 (server clock output, never round-tripped from external text — no writer path lets a caller set it, per S4 below) and git_sha is a 40-hex-char SHA whose shape execSync(`git rev-parse HEAD`) constrains, not free text. git_ref is nominally a branch name and, like S2, is developer-controlled on the machine that ran the write, not externally supplied. Theoretical residual risk: this repo has OTHER direct `.from(\'feedback\').insert(...)` call sites that bypass emitFeedback entirely (e.g. scripts/one-off/migrate-harness-backlog-to-feedback.mjs, various one-off scripts) — feedback-premise-adapter.js\'s _extractProvenance() reads metadata.measured_at/git_sha/git_ref off ANY row by shape alone, with no validation that it came through the stamping path. If a FUTURE writer ever accepted externally-supplied metadata verbatim into one of these three keys, a crafted value (e.g. embedding ANSI escape sequences or CRLF) would flow unsanitized into console.error output — a real but narrow log/terminal-injection primitive, and blast radius is limited to the calling operator\'s OWN terminal session (self-inflicted, not remote-exploitable, since the reader is a local CLI, not a shared log aggregator or web-rendered view). No current writer does this. Recommendation: truncate/sanitize (strip control chars, cap length) before printing as defense-in-depth, consistent with C-SEC-3B\'s spirit — worth doing, but proportionate to LOW severity; does not block this SD.'
  },
  {
    id: 'S4-anti-spoof-confirmed-by-code-and-test',
    severity: 'INFO',
    summary: 'Confirmed by direct read: lib/governance/emit-feedback.js:120-131 builds `metadata: { ...enrichedMetadata, dedup_hash: dedupHash, emitted_at: new Date().toISOString(), ...buildMeasurementProvenance(provenanceDeps) }` — enrichedMetadata (which carries any caller-supplied metadata.* including a spoofed measured_at/git_sha/git_ref) is spread FIRST at line 121, and `...buildMeasurementProvenance(provenanceDeps)` is spread LAST at line 131, so in a plain JS object literal the provenance keys always win per last-spread-wins semantics — a caller-supplied metadata.measured_at cannot override the real one. This matches the documented PAT-PROVENANCE-SPOOF-VIA-SPREAD-ORDER-001 fix shape (spread caller-supplied data first, stamp canonical data last) exactly. VERIFIED LIVE: ran `npx vitest run tests/unit/governance/measurement-provenance.test.js` — the test "TS-6: a caller CANNOT spoof its own provenance" passes; it calls emitFeedback with metadata:{measured_at:\'1999-01-01T00:00:00.000Z\', git_sha:\'deadbeefdeadbeef\', git_ref:\'attacker-branch\'} and asserts the resulting inserted row.metadata.measured_at/git_sha/git_ref equal the REAL stamped values, not the attacker-supplied ones. 20/20 tests passed across measurement-provenance.test.js and feedback-premise-adapter-provenance.test.js.'
  },
  {
    id: 'S5-availability-impact-bounded-non-hot-path',
    severity: 'INFO',
    summary: 'defaultGit (measurement-provenance.js:24) has an 8000ms execSync timeout and every emitFeedback() write now shells out twice (rev-parse HEAD, rev-parse --abbrev-ref HEAD) sequentially inside buildMeasurementProvenance (measurement-provenance.js:76-77). Worst-case pathological latency is therefore up to ~16s added to a write if git hangs (rare — local filesystem git commands typically return in single-digit milliseconds). Two mitigating factors make this a non-blocking availability concern: (1) grep of production callers of emitFeedback shows exclusively backend/async contexts — watchdogs (lib/adam/inbound-backlog-watchdog.js, outbound-silence-watchdog.js), cron sweeps (scripts/cron/adam-inbound-backlog-watchdog-sweep.mjs), lifecycle bridges, one-off/CLI scripts, and a Vision event-bus handler — none of these are synchronous HTTP request/response paths with a tight external SLA; (2) the fail-soft wrapper is real and independently verified: buildMeasurementProvenance wraps EACH git() call in its own try/catch (measurement-provenance.js:66-72, `safeGit`) and defaultGit itself catches internally (returns \'\' on ANY throw, :24-28) — TS-5 (test) explicitly injects a throwing git dependency and asserts emitFeedback still resolves and inserts the row. A HANGING (not throwing) git process is the one scenario the try/catch does not shortcut faster than the 8s timeout, but this is bounded, matches the pre-existing premise-liveness.js convention exactly, and was already an accepted risk profile for that code before this SD. Not a new availability class; proportionate to leave as-is.'
  },
  {
    id: 'S6-no-secrets-no-rls-change',
    severity: 'INFO',
    summary: 'No secrets, credentials, API keys, or PII are newly persisted or logged by this diff — the three new metadata keys (measured_at: ISO timestamp, git_sha: commit hash, git_ref: branch name) plus timezone (IANA zone string, e.g. "America/New_York" — a machine/user locale setting, not personal data tied to an individual in this internal-tooling context) are all low-sensitivity operational metadata. No RLS policy change is required or made: the diff writes into the EXISTING `feedback.metadata` jsonb column (already covered by whatever RLS policy governs the `feedback` table) rather than adding a new column or table, so no new authorization surface is introduced. feedback-premise-adapter.js\'s _extractProvenance() only READS metadata already returned by an authorized query (create-quick-fix.js\'s existing `.select(...).in(\'id\', resolvedFeedbackIds)` call, which was already selecting from `feedback` before this change) — it does not broaden what rows or columns are queryable.'
  }
];

const warnings = [
  'S1/S1b: defaultGit in BOTH measurement-provenance.js and its pre-existing sibling premise-liveness.js use execSync with a template-interpolated shell string rather than execFileSync with an argv array. Not exploitable today (no caller-controlled input reaches it), but is the less-defensive shape. Recommend a follow-on hardening QF that converts both to execFileSync(\'git\', [...args]) together, rather than fixing only the new file and leaving the identical pattern in premise-liveness.js.',
  'S3: console.error in create-quick-fix.js prints prov.measured_at/git_ref/git_sha without truncation or control-character stripping. Current writers cannot make these attacker-controlled, but feedback-premise-adapter.js\'s _extractProvenance() will happily surface these fields from ANY feedback row matching the shape, including ones inserted by future or existing direct `.from(\'feedback\').insert()` callers that bypass emit-feedback.js\'s spread-last stamping. Recommend adding a short defensive sanitize/truncate step before printing (strip control chars, cap to ~200 chars) as cheap, proportionate hardening — not a blocker.'
];

const recommendations = [
  'Follow-on (non-blocking): convert defaultGit in measurement-provenance.js AND premise-liveness.js to execFileSync(\'git\', [\'rev-parse\', \'HEAD\']) / [\'rev-parse\', \'--abbrev-ref\', \'HEAD\'] to eliminate the shell-interpolation shape as defense-in-depth, even though no reachable caller-controlled input exists today.',
  'Follow-on (non-blocking): sanitize/truncate prov.measured_at/git_ref/git_sha before console.error in create-quick-fix.js (strip control characters, cap length) to close the narrow theoretical log-injection gap if a future writer ever accepts untrusted metadata verbatim.',
  'No action required before merge/handoff: anti-spoof ordering, fail-soft git capture, and provenance carry-through are all correctly implemented and test-covered per findings S4/S5.'
];

const summary = 'SECURITY post-implementation review for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-E EXEC-TO-PLAN, covering commit 16adbbd210a (lib/governance/measurement-provenance.js new; lib/governance/emit-feedback.js spread-last stamping; lib/eva/feedback-premise-adapter.js additive provenance carry-through; scripts/create-quick-fix.js STALE_PREMISE provenance print). COMMAND INJECTION: measurement-provenance.js:24 defaultGit uses execSync(`git ${argsString}`) but the only production call site (emit-feedback.js:131) never passes caller-controlled args — internally it is invoked with exactly two hardcoded literals (\'rev-parse HEAD\', \'rev-parse --abbrev-ref HEAD\'). Not exploitable today; mirrors the pre-existing identical pattern at lib/eva/premise-liveness.js:35-37 and does not widen exposure. execFileSync with an argv array is recommended as a proportionate non-blocking follow-on covering both files together. INFORMATION DISCLOSURE: git_ref/git_sha are low-sensitivity (commit hash is already visible via git log; branch name reflects the operator machine\'s own checkout, not external user input) — LOW severity, not blocking. LOG INJECTION: the new console.error interpolations in create-quick-fix.js are fed by measured_at (server clock, never externally settable) and git_sha (shape-constrained by git rev-parse) plus git_ref (developer-controlled) — no CURRENT writer can inject attacker-controlled bytes into these fields, and any residual exposure is bounded to the operator\'s own terminal (self-inflicted). LOW severity; sanitize/truncate recommended as cheap hardening, not blocking. PROVENANCE SPOOFING: verified by direct code read (emit-feedback.js:121 spreads enrichedMetadata FIRST, :131 spreads buildMeasurementProvenance(provenanceDeps) LAST — last-spread-wins) AND by running the test suite live: `npx vitest run tests/unit/governance/measurement-provenance.test.js tests/unit/eva/feedback-premise-adapter-provenance.test.js` — 20/20 passed, including the explicit anti-spoof assertion (TS-6) that a caller-supplied metadata.measured_at/git_sha/git_ref is silently overwritten by the real stamped values. AVAILABILITY: two sequential execSync calls with an 8000ms timeout each is bounded, fail-soft (independently verified: throwing-git test still yields a successful write), and confined to backend/async/CLI write paths — no synchronous external-facing request depends on this latency. No new secrets, credentials, or PII are persisted; no RLS change needed since the diff writes into the EXISTING feedback.metadata jsonb column under whatever policy already governs that table. GO for EXEC-TO-PLAN — zero blocking findings; two proportionate LOW-severity hardening items filed as non-blocking follow-ons.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 90,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'EXEC-TO-PLAN',
      mode: 'post-implementation security review of committed diff (commit 16adbbd210a)',
      go_no_go: 'GO',
      severity_summary: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2, INFO: 4 },
      questions_answered: {
        command_injection: 'Not reachable today — sole call site (emit-feedback.js:131) uses two hardcoded literal args only; mirrors pre-existing lib/eva/premise-liveness.js:35-37 shape. execFileSync recommended as non-blocking follow-on.',
        information_disclosure: 'LOW — git_sha/git_ref duplicate already-visible repo metadata (commit hash, operator branch name), not externally supplied or secret.',
        log_injection: 'LOW — measured_at (server clock) and git_sha (shape-constrained) are not attacker-reachable via any current writer; git_ref is developer-controlled. Residual risk is theoretical (future non-emit-feedback writer) and self-inflicted (operator\'s own terminal). Sanitize/truncate recommended, non-blocking.',
        provenance_spoofing: 'Confirmed genuine: emit-feedback.js:121 spreads caller metadata FIRST, :131 spreads buildMeasurementProvenance() LAST (last-spread-wins). Verified live via vitest — TS-6 anti-spoof test passes (20/20 total).',
        availability: 'Bounded (8000ms x2 timeout, fail-soft try/catch verified via throwing-git test) and confined to backend/async/CLI paths, not synchronous external request handling.',
        secrets_pii_rls: 'None newly persisted/logged. No RLS change — writes into existing feedback.metadata jsonb column under existing table policy.',
      },
    },
    phase: 'EXEC-TO-PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Chief Security Architect' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
