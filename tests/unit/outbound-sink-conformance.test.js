/**
 * Outbound sink conformance census — SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001.
 *
 * THE DEFECT CLASS: a protective check wired at the LEAF-CALLER layer is
 * absent-by-default on every chairman-reaching sink added afterward, while
 * module-layer checks are inherited automatically. Measured on origin/main:
 * execute-vs-escalate is imported by 6 lib modules, consequence-classifier by 2,
 * but should-consult-solomon by 0 lib modules — it is the only leaf-placed check
 * and the only one that failed to reach the chairman lane.
 *
 * THIS IS A RATCHET, NOT A CONFORMANCE ASSERTION — and that distinction is
 * load-bearing. `.github/workflows/unit-tier.yml` triggers on pull_request with NO
 * paths filter, and "Run Unit Tier (quarantine-aware)" is the SOLE entry in
 * required_status_checks.contexts with enforce_admins=true. A test that is red from
 * PRE-EXISTING tree state would therefore fail EVERY pull request repo-wide,
 * regardless of what that PR touches, and could not be admin-overridden. So every
 * currently-non-conformant sink is SEEDED into KNOWN_DEBT below and this suite ships
 * GREEN; it fires only when a NEW non-conformant sink appears, or when a debt entry
 * goes stale. Same shape as tests/unit/session-coordination-consumption-census.test.js,
 * which seeded its 12 pre-existing sites and shipped green.
 *
 * HONEST LIMIT — do not read more into a green run than this. Allowlists are
 * editable and an agent that writes a sink can also write the allowlist. What this
 * buys is converting SILENT omission into VISIBLE, DIFFED, ATTRIBUTABLE omission.
 * It is not bypass-proof. In particular, recall is measured against a KNOWN sink
 * list, not the true send population: at least three real sends use raw fetch,
 * import nothing, and are therefore structurally invisible to import-graph
 * traversal (see NOT_A_SINK).
 *
 * PURITY: imports only vitest + node builtins + the static-analysis primitives.
 * It never imports a scanned file (their top-level requires have side effects) and
 * never imports the wire-check gates (they pull child_process/repo-paths at module
 * scope, which would drag env/DB into the no-DB `unit` tier).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCallGraph } from '../../lib/static-analysis/call-graph-builder.js';
import { checkReachabilityWithChains } from '../../lib/static-analysis/reachability-checker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SELF_BASENAME = 'outbound-sink-conformance.test.js';

/** Subgraph roots for SINK DISCOVERY. Deliberately narrow: unrestricted traversal
 *  collapses through hub modules (measured 396 modules / 201 entrypoints, ~1%
 *  precision). Depth-bounding was tested and is the wrong knob. */
const DISCOVERY_ROOTS = [
  'lib/comms',
  'lib/chairman',
  'lib/notifications',
  'lib/adam',
  'lib/messaging',
  'lib/coordinator/adam-outbound-gate.js',
];

/** In-scope paths that lie OUTSIDE the discovery roots. Carried explicitly rather
 *  than by widening the roots, which would reintroduce the hub-escape collapse. */
const ADDITIONAL_SCOPE = [
  { path: 'lib/integrations/todoist/chairman-notify.js', reason: 'Third outbound channel (Todoist) reached from the chairman lane; emits via raw fetch, so it is both a target and in-scope.' },
  { path: 'lib/switch-automation/switchon-decision-packet.js', reason: 'Lib-layer originator of the second decision-packet stack; missed entirely if only entrypoints are enumerated.' },
  { path: 'scripts/adam-decision-email.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom.' },
  { path: 'scripts/adam-exec-summary.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom.' },
  { path: 'scripts/adam-heartbeat-email.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom.' },
];

/** The real emitters. A module is a "sink" when it can reach one of these. */
const TRANSPORT_TARGETS = [
  'lib/messaging/providers/twilio-provider.js',
  'lib/notifications/resend-adapter.js',
  'lib/integrations/todoist/chairman-notify.js',
];

/** The protective check whose leaf placement caused the defect class. */
const CONSULT_GATE = 'lib/adam/should-consult-solomon.js';

/** NOT sinks — genuine classification errors of the traversal, not deferred work.
 *  An earlier revision of this comment claimed that keeping this list separate from
 *  KNOWN_DEBT meant real debt "can never be laundered as not a sink". That was FALSE:
 *  adversarial review proved that MOVING an entry from KNOWN_DEBT into NOT_A_SINK
 *  passed every test, because set disjointness is preserved by a move and runCensus()
 *  skips NOT_A_SINK paths BEFORE evaluating conformance. The guarantee now comes from
 *  EXPECTED_NON_CONFORMANT + NOT_A_SINK_EXPECTED below, not from disjointness. */
const NOT_A_SINK = [
  { path: 'api/webhooks/twilio-sms.js', reason: 'INBOUND Twilio webhook, not an outbound sink. The single known false positive of the traversal.' },
  { path: 'lib/marketing/ai/email-campaigns.js', reason: 'Sends via raw fetch to api.resend.com and imports nothing from lib/notifications, so it is structurally invisible to import-graph traversal. Named so the census never implies coverage it lacks.' },
  { path: 'lib/services/sovereign-alert.js', reason: 'Sends via raw fetch to api.resend.com and imports nothing; structurally invisible to import-graph traversal.' },
];

/**
 * Pre-existing non-conformant sinks — chairman-reaching modules that can reach an
 * outbound transport WITHOUT inheriting the consult gate. Seeded from a measured run
 * of this census against the tree at authoring time, so the suite ships GREEN and
 * fires only on drift. This is the "visible, diffed, attributable" record the SD
 * exists to produce: before this list existed, none of these was discoverable.
 *
 * This list is SHRINK-ONLY. Remediating any entry means wiring the consult gate into
 * that module, deleting its line here, and LOWERING the ceiling below.
 * Remediation itself is out of scope for this SD (it is a behavior change to live
 * chairman comms); C4, the runtime gate-verdict envelope, is the deferred follow-on
 * that constrains the transports themselves.
 */
const KNOWN_DEBT = [
  { path: 'lib/adam/stall-alert.js', reason: 'Reaches a transport without the consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/chairman/chairman-gated-decision-row-guard.mjs', reason: 'New caller of the already-non-conformant lib/chairman/record-pending-decision.mjs (same LIB-LAYER-originator shape, no transport literal of its own). Wiring should-consult-solomon into this caller instead of its callee would be leaf-placement, the exact defect class this census exists to catch, and is a live-chairman-comms behavior change outside the reviewed PRD scope for this SD.', linked_ref: 'SD-LEO-INFRA-CHAIRMAN-GATED-SD-DECISION-ROW-GUARD-001' },
  { path: 'lib/chairman/record-pending-decision.mjs', reason: 'LIB-LAYER originator reaching a transport without the consult gate; invisible to grep because it holds no transport literal.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/chairman/sms-bridge.js', reason: 'Static import of the Twilio provider, no consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/chairman/sms-channel-health.js', reason: 'Reaches the SMS transport without the consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/chairman/sms-outbound-worker.js', reason: 'Static import of the Twilio provider, no consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/comms/adam-outbound/chairman-sms-gate/index.js', reason: 'Reaches the email transport via a literal dynamic import, no consult gate — and its own comment notes the gate "was absent here".', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/comms/adam-outbound/decision-scheduler/index.js', reason: 'Reaches a transport without the consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/notifications/channel-health-recorder.js', reason: 'Reaches the email transport without the consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/notifications/orchestrator.js', reason: 'Static consumer of the Resend adapter, no consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/notifications/scheduler.js', reason: 'Reaches the email transport without the consult gate. Pre-existing at census authoring.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'lib/switch-automation/switchon-decision-packet.js', reason: 'LIB-LAYER originator of the second decision-packet stack; missed entirely by entrypoint-only enumeration.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'scripts/adam-decision-email.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom; invisible to the census until that idiom was resolved.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'scripts/adam-exec-summary.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
  { path: 'scripts/adam-heartbeat-email.mjs', reason: 'Reaches the email transport only via the pathToFileURL dynamic-import idiom.', linked_ref: 'SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001' },
];
/** Committed ceiling — the ratchet. Never raise this; lowering it is the point. */
const KNOWN_DEBT_CEILING = 15;

/**
 * IDENTITY BASELINE — the actual anti-laundering guarantee.
 *
 * The frozen set of paths that were non-conformant when this control was authored,
 * measured with BOTH allowlists ignored. Pinned by IDENTITY rather than by count or
 * by set-disjointness, so none of these can be silently reclassified: moving one into
 * NOT_A_SINK, deleting it from KNOWN_DEBT without remediating, or narrowing the
 * discovery roots all make it vanish from the census and fail the subset assertion.
 * Removing an entry here is therefore a deliberate, diffed, reviewable edit — which
 * is the whole point of the control.
 *
 * Shrinking this is legitimate ONLY when the sink genuinely inherits the consult gate
 * (or the module is gone).
 */
const EXPECTED_NON_CONFORMANT = [
  'lib/adam/stall-alert.js',
  'lib/chairman/record-pending-decision.mjs',
  'lib/chairman/sms-bridge.js',
  'lib/chairman/sms-channel-health.js',
  'lib/chairman/sms-outbound-worker.js',
  'lib/comms/adam-outbound/chairman-sms-gate/index.js',
  'lib/comms/adam-outbound/decision-scheduler/index.js',
  'lib/notifications/channel-health-recorder.js',
  'lib/notifications/orchestrator.js',
  'lib/notifications/scheduler.js',
  'lib/switch-automation/switchon-decision-packet.js',
  'scripts/adam-decision-email.mjs',
  'scripts/adam-exec-summary.mjs',
  'scripts/adam-heartbeat-email.mjs',
];

/** Exact expected NOT_A_SINK membership — parking a real sink here now fails loudly. */
const NOT_A_SINK_EXPECTED = [
  'api/webhooks/twilio-sms.js',
  'lib/marketing/ai/email-campaigns.js',
  'lib/services/sovereign-alert.js',
];

const toPosix = (p) => p.replace(/\\/g, '/');
const relPosix = (abs) => toPosix(path.relative(REPO_ROOT, abs));

/** Recursively collect source files under a repo-relative dir (or return the file itself). */
function collectFiles(relRoot) {
  const abs = path.join(REPO_ROOT, relRoot);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [toPosix(abs)];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Explicit skips so developer scratch dirs cannot cause local-only failures.
        if (['node_modules', '.git', '.worktrees'].includes(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (/\.(js|mjs|cjs)$/.test(entry.name) && !/\.(test|spec)\.(js|mjs|cjs)$/.test(entry.name)) {
        // Test/spec files are excluded by CLASS, not by allowlist: a test that
        // imports a transport is exercising it, not emitting to the chairman.
        // Measured: including them cost 2 false positives (the lib/chairman/__tests__
        // SMS specs) and dropped precision from ~100% to ~90%.
        out.push(toPosix(full));
      }
    }
  };
  walk(abs);
  return out;
}

/**
 * Run the census. Returns non-conformant sinks as sorted repo-relative POSIX paths.
 * @param {{ ignoreKnownDebt?: boolean }} [opts] ignoreKnownDebt proves the detector fires.
 */
function runCensus(opts = {}) {
  const scopeRoots = [...DISCOVERY_ROOTS, ...ADDITIONAL_SCOPE.map((e) => e.path)];
  const files = [...new Set(scopeRoots.flatMap(collectFiles))].sort();

  // Subgraph-restricted so hub modules cannot collapse the graph, and opt into the
  // pathToFileURL idiom so the three scripts/adam-*.mjs sites are visible at all.
  const { graph } = buildCallGraph(files, REPO_ROOT, {
    resolveFileUrlIdiom: true,
  });

  const abs = (rel) => toPosix(path.join(REPO_ROOT, rel));
  const targets = TRANSPORT_TARGETS.map(abs).filter((p) => fs.existsSync(p));
  const gateAbs = abs(CONSULT_GATE);

  // ignoreNotASink is what makes the identity baseline un-launderable: with it set, a
  // path moved into NOT_A_SINK is still evaluated, so it cannot vanish quietly.
  const notASink = new Set(opts.ignoreNotASink ? [] : NOT_A_SINK.map((e) => e.path));
  const debt = new Set(opts.ignoreKnownDebt ? [] : KNOWN_DEBT.map((e) => e.path));
  // The transports (and the barrel that re-exports one) are the EMITTERS, not
  // callers of an emitter. The consult gate belongs on the code that decides to
  // send, so a transport "reaching itself" is a self-edge artifact, not a finding.
  // C4 (deferred to a follow-on SD) is what constrains the transports themselves.
  const isTransportItself = new Set([...TRANSPORT_TARGETS, 'lib/notifications/index.js']);

  const sinks = [];
  const nonConformant = [];

  for (const file of files) {
    const rel = relPosix(file);
    if (rel === relPosix(gateAbs)) continue; // the gate itself is not a sink
    if (isTransportItself.has(rel)) continue;
    const { reachable } = checkReachabilityWithChains(graph, [file], targets);
    if (reachable.size === 0) continue;
    if (notASink.has(rel)) continue;
    sinks.push(rel);

    const { reachable: gateReach } = checkReachabilityWithChains(graph, [file], [gateAbs]);
    if (gateReach.size === 0 && !debt.has(rel)) nonConformant.push(rel);
  }

  return { sinks: sinks.sort(), nonConformant: nonConformant.sort() };
}

describe('outbound sink conformance — ratchet', () => {
  it('discovers a non-empty sink set (guards against a vacuously-passing census)', () => {
    const { sinks } = runCensus();
    expect(sinks.length).toBeGreaterThan(0);
  });

  it('resolves every discovery root and additional-scope path on disk', () => {
    const missing = [...DISCOVERY_ROOTS, ...ADDITIONAL_SCOPE.map((e) => e.path)]
      .filter((rel) => !fs.existsSync(path.join(REPO_ROOT, rel)));
    expect(missing).toEqual([]);
  });

  it('finds the transport targets in scope', () => {
    const present = TRANSPORT_TARGETS.filter((rel) => fs.existsSync(path.join(REPO_ROOT, rel)));
    expect(present.sort()).toEqual([...TRANSPORT_TARGETS].sort());
  });

  it('RATCHET: no NEW chairman-reaching sink lacks the consult gate', () => {
    const { nonConformant } = runCensus();
    // If this fails, either wire the consult gate into the listed module, or add a
    // KNOWN_DEBT entry with a real reason + linked_ref. Do NOT add it to NOT_A_SINK.
    expect(nonConformant).toEqual([]);
  });

  it('DETECTION PROOF: with KNOWN_DEBT ignored, the census still reports non-conformant sinks by name', () => {
    // Guards the detector against being neutered into a no-op (TEST-MASKING).
    const seeded = runCensus({ ignoreKnownDebt: true });
    if (KNOWN_DEBT.length > 0) {
      expect(seeded.nonConformant.length).toBeGreaterThan(0);
      for (const entry of KNOWN_DEBT) expect(seeded.nonConformant).toContain(entry.path);
    } else {
      // No debt seeded: the tree is fully conformant, so the detector has nothing to
      // report. Still assert it produced a real sink set rather than silently nothing.
      expect(seeded.sinks.length).toBeGreaterThan(0);
    }
  });
});

describe('allowlist integrity', () => {
  it('every NOT_A_SINK and ADDITIONAL_SCOPE entry carries a non-empty reason', () => {
    const bad = [...NOT_A_SINK, ...ADDITIONAL_SCOPE].filter((e) => !e.reason || !e.reason.trim());
    expect(bad).toEqual([]);
  });

  it('every KNOWN_DEBT entry carries a non-empty reason and a linked_ref', () => {
    const bad = KNOWN_DEBT.filter((e) => !e.reason || !e.reason.trim() || !e.linked_ref || !e.linked_ref.trim());
    expect(bad).toEqual([]);
  });

  it('KNOWN_DEBT is shrink-only: length stays at or below the committed ceiling', () => {
    expect(KNOWN_DEBT.length).toBeLessThanOrEqual(KNOWN_DEBT_CEILING);
  });

  it('the committed ceiling itself is pinned — raising it is a one-line ratchet kill', () => {
    // Without this, `KNOWN_DEBT.length <= CEILING` is trivially satisfiable by editing
    // the constant. Lowering it as debt is genuinely remediated is the only intended
    // change, and it must be a deliberate diffed edit here too.
    expect(KNOWN_DEBT_CEILING).toBe(15);
  });

  it('KNOWN_DEBT and NOT_A_SINK are disjoint (blocks duplication, NOT migration)', () => {
    // Necessary but far from sufficient: a MOVE preserves disjointness. The real
    // anti-laundering guarantee is the identity baseline assertion below.
    const notSink = new Set(NOT_A_SINK.map((e) => e.path));
    expect(KNOWN_DEBT.filter((e) => notSink.has(e.path))).toEqual([]);
  });

  it('ANTI-LAUNDERING: every baseline non-conformant path is still reported with BOTH allowlists ignored', () => {
    // Catches what disjointness cannot: reclassifying debt as not-a-sink, deleting a
    // debt entry without remediating, or narrowing the roots to hide it.
    const bare = runCensus({ ignoreKnownDebt: true, ignoreNotASink: true });
    for (const p of EXPECTED_NON_CONFORMANT) {
      expect(bare.nonConformant, `baseline sink no longer reported: ${p}`).toContain(p);
    }
  });

  it('NOT_A_SINK membership is pinned exactly — a real sink cannot be parked here', () => {
    expect(NOT_A_SINK.map((e) => e.path).sort()).toEqual([...NOT_A_SINK_EXPECTED].sort());
  });

  it('the honest-limit disclosure is present in the shipped source', () => {
    // Load-bearing: a green run must never be read as full coverage, since raw-fetch
    // sends are structurally invisible to this traversal.
    const src = fs.readFileSync(path.join(HERE, SELF_BASENAME), 'utf8');
    expect(src).toMatch(/not bypass-proof/i);
    expect(src).toMatch(/structurally invisible/i);
  });

  it('no allowlist entry is stale — every listed path still exists', () => {
    const stale = [...NOT_A_SINK, ...KNOWN_DEBT, ...ADDITIONAL_SCOPE]
      .map((e) => e.path)
      .filter((rel) => !fs.existsSync(path.join(REPO_ROOT, rel)));
    expect(stale).toEqual([]);
  });
});

describe('self-protection — this census cannot be silently disabled', () => {
  it('is not listed in the vitest quarantine manifest', () => {
    const manifestPath = path.join(REPO_ROOT, 'tests', 'quarantine-manifest.json');
    if (!fs.existsSync(manifestPath)) return; // fail-soft, same as loadQuarantineExclude
    const raw = fs.readFileSync(manifestPath, 'utf8');
    let manifest;
    // Assert it parses rather than letting a raw SyntaxError surface: the loader is
    // fail-soft, so a malformed manifest would silently quarantine nothing.
    expect(() => { manifest = JSON.parse(raw); }).not.toThrow();
    const entries = Array.isArray(manifest?.quarantined) ? manifest.quarantined : [];
    // BASENAME-strict: the loader maps each entry to the suffix glob `**/${file}`,
    // so a differently-pathed same-filename entry would still disable this file.
    const hits = entries.filter((e) => path.basename(String(e?.file || '')) === SELF_BASENAME);
    expect(hits).toEqual([]);
  });

  it('keeps the .test.js extension required by the unit project include globs', () => {
    // A .test.mjs is NOT collected outside tests/unit/org/ and tests/unit/venture-email/,
    // so renaming the extension would silently disable this census.
    expect(SELF_BASENAME.endsWith('.test.js')).toBe(true);
    expect(fs.existsSync(path.join(HERE, SELF_BASENAME))).toBe(true);
  });

  it('is not excluded by the vitest config', () => {
    const configPath = path.join(REPO_ROOT, 'vitest.config.js');
    if (!fs.existsSync(configPath)) return;
    const config = fs.readFileSync(configPath, 'utf8');
    expect(config).not.toContain(SELF_BASENAME);
  });
});
