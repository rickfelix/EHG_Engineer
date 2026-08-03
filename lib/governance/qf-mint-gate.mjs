/**
 * QF-SIDE BELT DEMAND GATE — SD-LEO-INFRA-GATE-SIDE-BELT-001 (GSB-B).
 *
 * The two cron producers that mint quick_fixes unattended were ungated: they could mint into a full
 * belt indefinitely. This is the seam they call.
 *
 * WHY THE GATE IS HERE AND NOT IN scripts/create-quick-fix.js. Neither minter writes quick_fixes
 * directly — each shells out via execFileSync to that CLI, which is ALSO how a human files a quick
 * fix by hand. A gate at a shared boundary hits every caller, so putting it there would block a
 * person at a keyboard. A belt-demand gate exists to stop UNATTENDED minting into a full belt, not
 * to second-guess human judgement, so it belongs at the two cron callers.
 *
 * WHY IT INJECTS A QF GAUGE. measureDemand's DEFAULT gauge is countDispatchableBacklog
 * (lib/governance/demand-gate-emit.js:86), which reads strategic_directives_v2 and cannot see a
 * single quick_fix. Gating QF production on it is an open loop that fails in BOTH directions: below
 * the floor, minted QFs never raise the reading so the gate never closes; above it, minting is
 * blocked no matter how starved the QF lane is. Measured at authoring: SD depth 21 against floor 3,
 * so the default gauge would have withheld every run and taken the harness-backlog drain to zero.
 *
 * WHY IT IS AN EXPORTED MODULE RATHER THAN INLINE CODE IN THE TWO SCRIPTS. Both minters are
 * top-level-await scripts with no exports, so every existing guard test for them is a REGEX OVER
 * SOURCE TEXT — which cannot see control flow, and control flow is all this gate is.
 * scripts/sourcing-engine/refill-cron.mjs:117-127 records five one-line mutants surviving the whole
 * suite at its previous inline callsite, for exactly that reason. Living in lib/ also means the seam
 * imports with no credentials, so its failure paths are reachable in a unit test.
 *
 * @module lib/governance/qf-mint-gate
 */
import { measureDemand as defaultMeasure, recordDemandDecision as defaultRecord, resolveDemandFloor } from './demand-gate-emit.js';
import { formatDemandDecision, mayProduce } from './demand-gate.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { countClaimableQuickFixes } = require('../fleet/belt-depth.cjs');

/**
 * Producer names, EXPORTED CONSTANTS rather than string literals at the call site.
 * refill-cron.mjs:110-112 records why: these must match their BELT_DEPTH_GATED_PRODUCERS entries
 * exactly, and a typo does not fail loudly — it renders NEVER RAN on the startup badge forever,
 * which reads identically to a producer that has simply not fired yet.
 */
export const FINGERPRINT_PROMOTER_ENGINE = 'feedback-fingerprint-promoter';
export const RETRO_ACTION_PROMOTER_ENGINE = 'promote-retro-action-items';

/**
 * Measure QF-side demand, record it, print it, and say whether minting may proceed.
 *
 * recordDemandDecision and formatDemandDecision are UNCONDITIONAL, mirroring
 * refill-cron.mjs:130-143: a withheld run that leaves no audit_log row is indistinguishable from a
 * dead cron, which is the state this whole mechanism exists to make visible.
 *
 * A malformed decision THROWS rather than falling through. Proceeding ungated because the gate
 * returned something unexpected is the fail-open flood wearing the costume of robustness.
 *
 * @param {object} supabase service-role client
 * @param {{engine:string, env?:object, gauge?:Function, measure?:Function, record?:Function, log?:Function}} opts
 * @returns {Promise<{allowed:boolean, demand:object}>}
 */
export async function openQfMintGate(supabase, {
  engine,
  env = process.env,
  gauge = countClaimableQuickFixes,
  measure = defaultMeasure,
  record = defaultRecord,
  log = console.log,
} = {}) {
  if (!engine) throw new Error('openQfMintGate: engine is required — an unnamed producer renders NEVER RAN on the badge');
  const demand = await measure(supabase, { engine, floor: resolveDemandFloor(env), gauge });
  // Record FIRST and unconditionally: even a malformed reading should leave a trace, and
  // recordDemandDecision already no-ops on a falsy decision.
  await record(supabase, demand);
  // Validate BEFORE rendering. formatDemandDecision assumes a well-formed decision and throws a
  // property-access error on anything else — so calling it first would replace this deliberate,
  // engine-named failure with an opaque one, hiding WHICH producer received garbage.
  if (!demand || typeof demand.decision !== 'string') {
    throw new Error(`openQfMintGate: ${engine} received a malformed demand decision — refusing to mint ungated`);
  }
  log(formatDemandDecision(demand, engine));
  return { allowed: mayProduce(demand), demand };
}

/**
 * Run `mint` only when the gate permits it.
 *
 * The seam DELIBERATELY ENCLOSES THE MINTING CALLBACK rather than merely returning a boolean the
 * caller is trusted to honour. A gate that only reports a verdict is one forgotten `if` away from
 * being decorative, and that omission is invisible to a source-text test.
 *
 * @param {object} supabase
 * @param {object} opts same as openQfMintGate
 * @param {() => Promise<number>|number} mint performs the actual minting; returns how many it minted
 * @returns {Promise<{minted:number, withheldByDemand:boolean, demand:object}>}
 */
export async function gatedQfMint(supabase, opts, mint) {
  const { allowed, demand } = await openQfMintGate(supabase, opts);
  if (!allowed) {
    // COUNT AND NAME WHAT WAS SUPPRESSED. Withholding is not free here: neither producer holds
    // durable pending state — the fingerprint promoter needs 3+ occurrences inside a rolling
    // 14-day window, the retro promoter works a 7-day lookback — so a withheld group does not
    // queue, IT EXPIRES. Measured at review: 35 promotable groups, all critical, falling below
    // threshold within 8-14 days (SEC-GSB-2).
    //
    // Worse, the loss was INVISIBLE from both directions: the audit row carries engine/gauge/floor/
    // decision but no suppressed count, and because the mint callback never ran, the [PROMOTABLE]
    // lines that would name the casualties were never printed either. A gate whose cost cannot be
    // counted cannot be argued about — the floor stays wrong because nobody can see what it costs.
    //
    // onWithheld runs the producer's own loop in REPORT-ONLY mode: same eligibility logic, same
    // [PROMOTABLE] output, no spawn. Whether the floor SHOULD withhold this much is an operational
    // decision; making the bill legible is not.
    let suppressed = null;
    if (typeof opts.onWithheld === 'function') {
      try { suppressed = Number(await opts.onWithheld(demand)) || 0; }
      catch { suppressed = null; }   // a failed count must not turn a quiet run into a crash
    }
    if (suppressed !== null) {
      (opts.log || console.log)(`[demand-gate] ${opts.engine}: WITHHELD suppressed ${suppressed} promotable group(s) — these do NOT queue, they expire on their source window`);
    }
    return { minted: 0, withheldByDemand: true, demand, suppressed };
  }
  const minted = await mint();
  return { minted: Number(minted) || 0, withheldByDemand: false, demand, suppressed: 0 };
}
