// SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-3 + FR-4.
//
// THE DEFECT THIS REPLACES WAS AN INVERSION, NOT A GAP. adam-register.cjs and solomon-register.cjs
// answered "was the contract read?" from `status.lastReadWasPartial` — a boolean about the MOST
// RECENT call. On a contract larger than the 25k-token Read cap that gets the answer exactly
// backwards:
//   a no-offset Read TRUNCATES at ~line 166 of 421 and records lastReadWasPartial=false -> "read"
//   a diligent paginated full read records lastReadWasPartial=true on its last page  -> "partial"
// The reader who did the least was recorded complete; the reader who did the work was recorded
// incomplete. Filed as feedback 39c3d27d on 2026-07-19 and mis-titled as a capability gap, which is
// why it sat for ten days: the capability was already there.
//
// *** THIS LIVES AT THE CONSUMER, DELIBERATELY, AND THAT IS THE MOST IMPORTANT LINE IN THE FILE. ***
// The obvious fix is to redefine partial-ness inside protocol-file-tracker.cjs. Do not. That same
// stamp is read by protocol-file-read-gate.js:159, which is wired into ALL FOUR handoff executors —
// so changing its meaning would alter handoff gating for CLAUDE_LEAD/PLAN/EXEC.md fleet-wide in order
// to fix a defect affecting two role contracts. Fixing it here contains the blast radius to the
// roles that have the problem, and leaves the tracker's per-call stamp accurate as what it actually
// is: a fact about ONE call. The bug was ever using it to answer a whole-file question.
//
// FR-4: the union-of-ranges maths is IMPORTED, not reauthored. A correct implementation already
// existed and was wired to nothing. NOTE THE NARROW IMPORT — only unionRangeCoverage. Its sibling
// computeCoveragePercent carries a `no_limit_final_read` fallback that reproduces the very
// truncation bug this SD exists to close, and it ignores its caller's projectDir. "Import rather
// than reauthor" was right in spirit and wrong if applied wholesale.
const path = require('path');
const fs = require('fs');

/**
 * unionRangeCoverage, loaded LAZILY and inside a try.
 *
 * *** IT WAS A TOP-LEVEL require AND THAT PULLED A SUPABASE SERVICE-ROLE CLIENT INTO A FAIL-OPEN
 * PATH. *** Both registers require this module at load time, and their own docblocks promise that
 * registration must never be blocked. Importing sd-key-generator.js for ONE pure helper transitively
 * ran dotenv.config() and a live Supabase client factory as import side effects — SECURITY confirmed
 * empirically with `env -i`: process.env went from 4 keys to 78, including SUPABASE_SERVICE_ROLE_KEY.
 * It does not throw today, but a fail-open-critical path had acquired a hard dependency on an
 * unrelated, actively-edited module graph, and a throw at import time cannot be caught by the
 * try/catch inside checkContractRead.
 *
 * Deferring it means the only tier that needs it pays for it, inside a guard, and a failure there
 * degrades to unknown_coverage rather than taking down role activation.
 */
function loadUnionRangeCoverage() {
  try {
    // require(esm) — stable since Node 22.12; this fleet runs 24. Verified no top-level await, the
    // one thing that would throw ERR_REQUIRE_ASYNC_MODULE.
    return require('../../scripts/modules/sd-key-generator.js').unionRangeCoverage;
  } catch {
    return null;
  }
}

/** Coverage at or above this counts as a full read. Matches the imported implementation's own bar. */
const FULL_COVERAGE_PCT = 95;

/**
 * The ACTUAL harness limit: a Read returns at most this many TOKENS. Not a proxy for it.
 */
const SINGLE_READ_TOKEN_CAP = 25000;

/**
 * Lazily-loaded cl100k_base encoder, cached. Same lazy+guarded discipline as unionRangeCoverage
 * above, and for the same reason: this module is imported by role-ACTIVATION paths that promise
 * never to block. A tokenizer that cannot load degrades to "unmeasurable", never to "fits".
 */
let _encoder;
let _encoderTried = false;
function loadEncoder() {
  if (_encoderTried) return _encoder;
  _encoderTried = true;
  try {
    _encoder = require('tiktoken').get_encoding('cl100k_base');
  } catch {
    _encoder = null;
  }
  return _encoder;
}

/**
 * Usable token budget: the cap minus a margin for two irreducible sources of error.
 *
 * 1. cl100k_base is GPT-4's tokenizer; the 25k cap is a Claude Code limit. Close, not identical,
 *    and nothing in this repo can measure the real one.
 * 2. Even measuring the framed response cannot capture every byte of harness envelope.
 *
 * A margin is what keeps a verdict from resting inside its own error bar. At 10% the real contracts
 * still land unambiguously (coordinator ~6.6k, solomon ~17.4k, adam ~27.6k against a 22,500 budget),
 * so no role's verdict is decided by the margin — which is the property that matters.
 */
const SINGLE_READ_MARGIN = 0.10;
const SINGLE_READ_TOKEN_BUDGET = Math.floor(SINGLE_READ_TOKEN_CAP * (1 - SINGLE_READ_MARGIN));

/**
 * Measured token length of a contract AS THE READ TOOL WOULD DELIVER IT, or null.
 *
 * *** MEASURES THE FRAMED RESPONSE, NOT THE RAW FILE. *** Read returns `cat -n` formatted output, so
 * every line carries a number and a tab that count against the cap. Encoding the raw bytes
 * understates the real cost by ~400-2,000 tokens on these contracts — measuring the wrong artefact
 * is how the byte proxy went wrong in the first place, one level down.
 *
 * encode_ordinary, NOT encode: cl100k_base's `encode` THROWS on special-token literals such as
 * <|endoftext|>, including inline in prose. A contract that merely documents one would have thrown,
 * degraded to the byte fallback, and silently flipped CLAUDE_COORDINATOR.md from ARMED to disarmed
 * on the strength of a documentation string. encode_ordinary treats them as ordinary text.
 */
function contractTokenCount(root, contractFile) {
  try {
    const enc = loadEncoder();
    if (!enc) return null;
    const raw = fs.readFileSync(path.join(root, contractFile), 'utf8');
    const framed = raw.split('\n').map((line, i) => `${String(i + 1).padStart(6)}\t${line}`).join('\n');
    return enc.encode_ordinary(framed).length;
  } catch {
    return null;
  }
}

/**
 * A contract this size or smaller is covered by a single Read, so a no-argument read of it is
 * genuinely complete and needs no further evidence.
 *
 * *** THIS THRESHOLD EXISTS BECAUSE A CI FAILURE EXPOSED A REAL FALSE NEGATIVE IN MY OWN FIX. ***
 * Requiring positive coverage evidence unconditionally is correct for an over-cap contract and WRONG
 * for a small one: with no lastDelivered and no ranges, a perfectly good single read of a 25KB file
 * would report "partial" forever. That is a permanent false alarm on every Adam and Solomon startup,
 * and a warning that always fires gets demoted to noise — which is precisely the failure this SD
 * exists to remove. Trading a false positive for a false negative is not a fix.
 *
 * *** THE ORIGINAL 50,000 WAS JUSTIFIED BY A CLAIM THAT TURNED OUT TO BE FALSE. *** I wrote that
 * 2 bytes/token is "below any real tokenizer's ratio". SECURITY measured it with tiktoken
 * (cl100k_base) on 50,000-byte samples and it is not: random ASCII ~1.32 B/token (38,024 tokens, 52%
 * OVER the 25k cap), base64 ~1.40 (35,855, 43% over), hex/minified ~1.77 (28,194, over). Only prose
 * (~5.4) and dense CJK (~2.44) stayed under. So a 50KB contract that later gains a base64 or
 * minified blob could cross the real cap and still be waved through as fully read — the exact defect
 * this module closes. A stated worst case that was never measured is the same shape as the field
 * name that does not match its implementation.
 *
 * *** AND THE RE-DERIVATION WAS *ALSO* WRONG — IN BOTH DIRECTIONS. THIS IS THE THIRD ATTEMPT. ***
 * I replaced the 50,000 with "25,000 tokens x 1.32 B/token = 33,000, set 32,000 for margin", calling
 * 1.32 "the densest measured case". It was the densest case *I happened to sample*, presented as a
 * worst case — the same error as the claim it replaced, one rung down. cl100k_base is byte-level BPE
 * with 256 single-byte fallback tokens, so the true floor is 1.0 B/token, and SECURITY measured
 * 32,000-byte payloads that encode to 32,000 tokens (28% over cap). A sample maximum is not a bound.
 *
 * *** THE PROXY WAS ALSO WRONG ABOUT A REAL FILE, WHICH IS HOW IT GOT CAUGHT. *** Measured:
 *   CLAUDE_COORDINATOR.md  25,587 B ->  6,197 tokens  (4.13 B/tok)
 *   CLAUDE_SOLOMON.md      67,501 B -> 15,965 tokens  (4.23 B/tok)  <-- FITS. Byte proxy said no.
 *   CLAUDE_ADAM.md        106,286 B -> 25,569 tokens  (4.16 B/tok)  <-- over by 569, not by 4x.
 * Prose runs ~4.2 B/token, so a byte bound tuned for adversarial density disarms roles that can
 * already comply. Solomon was being told its contract was unreadable when it reads in one call.
 * There is no byte value that is both sound and useful: the only provably safe one is 25,000 B,
 * which would exclude the 6,197-token coordinator contract.
 *
 * SO THE PROXY IS RETIRED. singleReadFit() MEASURES tokens (the SD's own success criteria required
 * "each token figure re-measured rather than inherited from a bytes derivation"). This constant
 * survives ONLY as the degraded-mode fallback for when the tokenizer will not load, and is set to
 * the one value that is provably sound at the 1.0 B/token floor. In that mode the coordinator
 * contract reads as not-provably-fitting — the safe direction, and the correct one to fail toward.
 */
const SINGLE_READ_SAFE_BYTES = 25000;

/**
 * Can this contract be read in ONE call? Measured, with an explicit "cannot tell".
 *
 * `fits: null` is a first-class answer and must never be coerced to true — an unmeasurable contract
 * is exactly the case where promoting absence of evidence to compliance does the damage.
 *
 * @returns {{fits: boolean|null, tokens: number|null, bytes: number|null, basis: string}}
 */
function singleReadFit(root, contractFile) {
  const rawBytes = contractSizeBytes(root, contractFile);
  const bytes = Number.isFinite(Number(rawBytes)) && Number(rawBytes) > 0 ? Number(rawBytes) : null;
  const rawTokens = contractTokenCount(root, contractFile);
  const tokens = Number.isFinite(Number(rawTokens)) && Number(rawTokens) > 0 ? Number(rawTokens) : null;

  if (tokens !== null) {
    return { fits: tokens <= SINGLE_READ_TOKEN_BUDGET, tokens, bytes, basis: 'measured_tokens' };
  }
  if (bytes !== null) {
    // Degraded mode: no tokenizer. Fall back to the provably-sound byte floor, never to the old
    // tuned proxy, and say so in the basis rather than letting it read as a measurement.
    return { fits: bytes <= SINGLE_READ_SAFE_BYTES, tokens: null, bytes, basis: 'conservative_bytes_no_tokenizer' };
  }
  return { fits: null, tokens: null, bytes: null, basis: 'unmeasurable' };
}

/**
 * Union coverage of a range list as a percentage, or null when it yields no usable evidence.
 *
 * *** SEC-F12 — THE IMPORTED HELPER'S EOF DEFAULT IS INVERTED FOR MEASURED RANGES, AND I SHIPPED
 * THAT AS A REGRESSION. *** unionRangeCoverage does `Number(r.limit) || (totalLines - from + 1)`,
 * i.e. a falsy limit means "to end of file". That is RIGHT for a REQUESTED range — `Read(offset=1)`
 * genuinely does ask for the rest — and exactly BACKWARDS for a DELIVERED one, where `limit` is the
 * measured line count and 0 means nothing came back. So `deliveredRanges: [{offset:1, limit:0}]`
 * unioned to 100% and returned fully_read=true: a read that delivered NOTHING certified as complete,
 * through the tier I had just promoted to strongest. Reachable from the canonical writer, which
 * guards only on Number.isFinite — and both Number(0) and Number(null) are finite.
 *
 * SEC-F15, same root cause on the other list: an open-ended requested range (`{offset:1, limit:null}`
 * from `Read(path, offset=1)`) is precisely the call the harness can silently truncate, so counting
 * it as coverage-to-EOF is the original defect again. Both lists therefore require an explicit
 * positive limit; anything else contributes no evidence rather than maximal evidence.
 */
function unionPct(ranges, total) {
  if (!Array.isArray(ranges) || ranges.length === 0 || !Number.isFinite(total) || total <= 0) return null;
  const usable = ranges.filter((r) => r && Number.isFinite(Number(r.limit)) && Number(r.limit) > 0);
  if (usable.length === 0) return null;
  const unionRangeCoverage = loadUnionRangeCoverage();
  // Unavailable => unknown, never "complete". Same rule as every other tier here.
  if (typeof unionRangeCoverage !== 'function') return null;
  // Returns { covered, uncovered } — NOT a bare number. Destructuring matters: treating the object
  // as a number yields NaN, and NaN >= 95 is false, so that bug would present as "no read ever
  // counts as full" rather than as a crash.
  const { covered } = unionRangeCoverage(usable, total);
  const pct = Math.round((Number(covered) / total) * 100);
  return Number.isFinite(pct) ? pct : null;
}

/** Line count of a contract on disk, or null when it cannot be determined. */
function contractLineCount(root, contractFile) {
  try {
    const raw = fs.readFileSync(path.join(root, contractFile), 'utf8');
    return raw.split('\n').length;
  } catch {
    return null;
  }
}

/** Byte size of a contract on disk, or null. Decides whether one Read can cover it. */
function contractSizeBytes(root, contractFile) {
  try {
    return fs.statSync(path.join(root, contractFile)).size;
  } catch {
    return null;
  }
}

/**
 * Decide whether a role contract was genuinely read, from evidence rather than from a stale boolean.
 *
 * Precedence is deliberate — strongest evidence first:
 *   1. lastDelivered  — what the read ACTUALLY returned (FR-5). The only signal that can see a
 *      silently-truncated no-argument read, because such a read sets no limit/offset and therefore
 *      never enters ranges[] at all.
 *   2. ranges[]       — union coverage across paginated reads. Catches the diligent reader the old
 *      boolean punished.
 *   3. readCount      — last resort, and it is EXPLICITLY NOT treated as proof of a full read.
 *
 * @returns {{read: boolean, fully_read: boolean, coverage_pct: number|null, basis: string}}
 */
function contractReadVerdict(status, totalLines, opts = {}) {
  if (!status || !(status.readCount > 0)) {
    return { read: false, fully_read: false, coverage_pct: null, basis: 'no_read_recorded' };
  }

  const d = status.lastDelivered;

  // 0. A contract that fits in a single Read cannot have been silently truncated, so the absence of
  //    a partial flag is sufficient evidence here.
  //
  //    *** BUT IT DEFERS TO CONTRADICTING DELIVERED EVIDENCE, AND THAT GUARD IS THE WHOLE POINT. ***
  //    This tier originally ran unconditionally first, so a 40KB contract whose OWN lastDelivered
  //    recorded 100 of 500 lines returned fully_read=true on basis 'single_read_safe_size' — a size
  //    INFERENCE overriding a direct MEASUREMENT that contradicted it. That is exactly the defect
  //    this module exists to close (a cheap proxy outranking the real signal), reintroduced one tier
  //    up by the fix for it. Found in SECURITY review; I reproduced it on the merged code before
  //    accepting the finding.
  //
  //    SEC-F6: an explicit `coveredWholeFile: false` contradicts the size tier ON ITS OWN. The
  //    original required BOTH line fields to be finite first, so a delivered record carrying only
  //    that flag was silently overridden by the size inference it directly denies.
  const deliveredContradicts = !!d && (
    d.coveredWholeFile === false
    || (Number.isFinite(Number(d.totalLines)) && Number.isFinite(Number(d.numLines))
        && !(d.coveredWholeFile === true || Number(d.numLines) >= Number(d.totalLines)))
  );

  // Prefer the MEASURED fit; fall back to the caller's byte figure only when no fit was supplied.
  // `fits === null` (unmeasurable) deliberately does NOT enter the tier.
  const fit = opts.singleReadFit;
  const legacyBytes = Number(opts.sizeBytes);
  const fitsInOneRead = fit
    ? fit.fits === true
    : (Number.isFinite(legacyBytes) && legacyBytes > 0 && legacyBytes <= SINGLE_READ_SAFE_BYTES);

  if (!deliveredContradicts && fitsInOneRead && status.lastReadWasPartial !== true) {
    return { read: true, fully_read: true, coverage_pct: 100, basis: 'single_read_safe_size' };
  }

  // The denominator. Prefer the harness's own totalLines over a count of the file on disk: it
  // describes the artefact that was actually served.
  const deliveredTotal = d && Number.isFinite(Number(d.totalLines)) && Number(d.totalLines) > 0
    ? Number(d.totalLines)
    : (Number.isFinite(totalLines) && totalLines > 0 ? totalLines : null);

  // MEASUREMENT OUTRANKS REQUEST. Not "take the best of the two" — that was wrong, twice over.
  //
  // *** SEC-F16: `ranges[]` IS NOT A LOWER BOUND ON WHAT WAS READ. *** It is a lower bound on what
  // was REQUESTED: protocol-file-tracker.cjs pushes `limit: toolInputData.limit`, the caller's
  // argument, never reconciled against what came back. Only `deliveredRanges` records delivery.
  //
  // I had briefly taken the MAX of the two, on the stated premise that both were lower bounds on
  // reading and neither could un-read the other. The premise was false, so the max let a REQUEST
  // outrank a MEASUREMENT and produced the worst output this module can produce:
  //     Read(offset=1, limit=520) truncated by the harness at 166/520  ->  100%, "fully read"
  // The positive-limit filter cannot catch it — a requested limit of 520 is finite and positive.
  // That is this SD's founding defect, restored in full, by a fix for a milder ordering complaint.
  //
  // The complaint that motivated the max was real but SAFE: when only some calls carried a
  // tool_response, deliveredRanges is a strict subset of ranges and coverage UNDER-reports. An
  // under-report costs a spurious "re-read your contract"; an over-report ships an unread contract.
  // For a gate whose entire job is proving a file was read, those are not trade-able. The right
  // place to fix the under-report is the TRACKER (always write deliveredRanges), never a rule here
  // that lets what someone asked for stand in for what they got.
  const denominator = deliveredTotal;
  const hasDelivered = Array.isArray(status.deliveredRanges) && status.deliveredRanges.length > 0;

  // Requested ranges are consulted ONLY when there is no delivery record at all — the legacy state
  // shape written before deliveredRanges existed. Never as a top-up when delivery looks incomplete.
  const pct = hasDelivered
    ? unionPct(status.deliveredRanges, denominator)
    : unionPct(status.ranges, denominator);

  if (pct !== null) {
    return {
      read: true,
      fully_read: pct >= FULL_COVERAGE_PCT,
      coverage_pct: pct,
      basis: hasDelivered ? 'delivered_ranges' : 'union_ranges',
    };
  }

  // *** KNOWN RESIDUAL, STATED RATHER THAN LEFT IMPLICIT (SEC-F14). ***
  // Everything above accumulates coverage across a session, which is sound only while the FILE IS
  // IMMUTABLE — and nothing enforces that. protocol-file-tracker.cjs stores no mtime, hash or size
  // beside the ranges, and these contracts are GENERATED artefacts that CLAUDE.md prologue #7
  // actively tells sessions to regenerate mid-session. Two reachable consequences:
  //   - cross-version accumulation: v1 lines 1-260 + v2 lines 261-520 unions to 100%, though no
  //     single version was ever fully read;
  //   - stale denominator: deliveredTotal prefers the harness's totalLines, so a read taken when the
  //     file was 300 lines still reports 100% after it grows to 520.
  // NOT fixed here, and deliberately so: the correct fix stamps a file identity in the TRACKER and
  // resets on change, which is a hot-path file this SD is under explicit instruction not to alter
  // (FR-3), and a heuristic bolted on at the consumer — comparing disk line count to the recorded
  // total — misfires on ordinary trailing-newline differences and would produce exactly the
  // always-on warning this SD exists to eliminate. Recorded as a follow-up rather than guessed at.
  //
  // 2. A single delivered record, with no usable range evidence at all. This is the lone truncated
  //    no-argument read: it sets no limit/offset, so it never enters ranges[], and on older state
  //    shapes it leaves no deliveredRanges either. Kept LAST because it can only ever describe one
  //    call — ranked above anything only when there is nothing better.
  //
  //    SEC-F2: totalLines MUST be > 0. Without it a degenerate 0-of-0 record satisfies `0 >= 0` and
  //    certifies a read as complete — and the tracker writes exactly that shape
  //    (`coveredWholeFile: delivered >= total`, guarded only on Number.isFinite, which 0/0 passes).
  if (d && Number.isFinite(Number(d.totalLines)) && Number(d.totalLines) > 0 && Number.isFinite(Number(d.numLines))) {
    const covered = d.coveredWholeFile === true || Number(d.numLines) >= Number(d.totalLines);
    return {
      read: true,
      fully_read: covered,
      coverage_pct: Math.round((Number(d.numLines) / Number(d.totalLines)) * 100),
      basis: 'delivered_lines'
    };
  }

  // 4. A read happened and we cannot say how much of the file it covered.
  //
  // NOT TREATED AS FULL, AND THAT IS THE WHOLE POINT. The old code reached exactly this state and
  // answered "fully read" whenever the last call carried no limit/offset — which is precisely the
  // truncated read. Absence of evidence is reported as absence, never promoted to completeness.
  return { read: true, fully_read: false, coverage_pct: null, basis: 'unknown_coverage' };
}

module.exports = {
  contractReadVerdict, contractLineCount, contractSizeBytes, contractTokenCount, singleReadFit,
  FULL_COVERAGE_PCT, SINGLE_READ_SAFE_BYTES, SINGLE_READ_TOKEN_CAP, SINGLE_READ_TOKEN_BUDGET,
};
