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
 * *** CALIBRATION AGAINST HARNESS GROUND TRUTH. THE MISSING PIECE THAT MADE THIS GATE WRONG. ***
 *
 * cl100k_base is GPT-4's tokenizer; the 25k cap is a CLAUDE limit. I knew that, called it an
 * "irreducible source of error", covered it with a 10% margin, and shipped. The margin was not the
 * problem — the ASSUMPTION that the two tokenizers were close was, and I never tested it. They are
 * not close: cl100k UNDERCOUNTS by ~1.79x.
 *
 * MEASURED, not assumed. A no-argument Read of CLAUDE_SOLOMON.md returns:
 *     "PARTIAL view — showing lines 1-301 of 371 total (26142 tokens, cap 25000)"
 * cl100k on that exact framed slice is 14,617. 26,142 / 14,617 = 1.788.
 *
 * WHAT THAT COST: the uncalibrated figure said CLAUDE_SOLOMON.md was 17,390 tokens and therefore
 * FIT in one read, so this SD ARMED Solomon and I reported "the byte proxy was disarming a role that
 * already complies" as its headline finding. Calibrated, it is ~31,101 — over the cap, and the Read
 * above truncates at line 301 of 371. The whole chain was right in method and wrong in instrument:
 * I replaced a byte proxy with a token proxy and never validated the token proxy against the thing
 * it proxies. Measuring the wrong quantity precisely is still measuring the wrong quantity — the
 * same error as the byte bound, one level up, for the third time in this SD.
 *
 * Rounded UP from 1.788 to 1.85: a calibration that undercounts re-creates the exact defect. The
 * ratio is a property of two tokenizers on prose, so it should be re-measured if the contracts stop
 * being prose (see the density discussion above) or if the harness tokenizer changes.
 */
const CL100K_TO_HARNESS = 1.85;

/**
 * Margin on top of the calibration, for what calibration cannot capture: harness envelope beyond the
 * cat -n framing, and drift in the ratio across content types.
 *
 * Calibrated figures for the real contracts — coordinator ~12.2k, solomon ~32.2k, adam ~51.0k
 * against a 22,500 budget — leave every verdict decided by a wide margin rather than by this number,
 * which is the only thing that makes it honest. (The pre-calibration version of this comment made
 * the same claim on figures that were 1.79x low, and was wrong about Solomon.)
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
    // CALIBRATED to the harness tokenizer. Returning the raw cl100k count here is what armed a role
    // whose contract demonstrably truncates — see CL100K_TO_HARNESS.
    return Math.ceil(enc.encode_ordinary(framed).length * CL100K_TO_HARNESS);
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
 * *** THE PROXY WAS ALSO WRONG ABOUT A REAL FILE. *** Measured on the
 * FRAMED response AND CALIBRATED to the harness tokenizer (see CL100K_TO_HARNESS). Only these
 * figures appear here: earlier drafts carried raw-file counts, then uncalibrated framed counts, and
 * several tables of different numbers for one thing is how the next reader picks the wrong one.
 *   CLAUDE_COORDINATOR.md  25,587 B -> ~12,193 tokens   <-- fits, with room to spare
 *   CLAUDE_SOLOMON.md      67,501 B -> ~32,172 tokens   <-- does NOT fit; a no-arg Read truncates
 *   CLAUDE_ADAM.md        106,286 B -> ~50,997 tokens   <-- over, by a wide margin
 * Prose runs ~4.2 B/token, so a byte bound tuned for adversarial density disarms roles that can
 * already comply. Solomon was being told its contract was unreadable when it reads in one call.
 * There is no byte value that is both sound and useful: the only provably safe one is 25,000 B,
 * which would exclude the 6,197-token coordinator contract.
 *
 * SO THE PROXY IS RETIRED. singleReadFit() MEASURES tokens (the SD's own success criteria required
 * "each token figure re-measured rather than inherited from a bytes derivation"). This constant
 * survives ONLY as the degraded-mode fallback for when the tokenizer will not load.
 *
 * *** IT CARRIES THE SAME MARGIN AS THE MEASURED PATH, AND IT DID NOT USED TO. *** It was 25,000:
 * provably sound at the 1.0 B/token floor, but sound against the CAP while every other decision in
 * this module is made against the BUDGET. That made the fallback MORE PERMISSIVE THAN THE MEASURED
 * PATH — 2,500 tokens more — i.e. the module was most generous exactly where it knew least. That is
 * the inverse of the doctrine stated throughout it, and the same shape as every defect this SD has
 * closed, sitting in the one path nobody had measured. Derived from the budget now, so degraded
 * mode can never be looser than measured mode by construction rather than by coincidence.
 */
/**
 * *** THIS CONSTANT'S JUSTIFICATION WENT FALSE WHEN THE SCALE BENEATH IT MOVED. ***
 * It was `= SINGLE_READ_TOKEN_BUDGET` (22,500), justified by "at the 1.0 B/token floor, bytes and
 * tokens coincide". True on the cl100k scale; false once tokens are calibrated to the harness. At
 * the cl100k 1.0 B/token floor, 22,500 bytes is 22,500 cl100k tokens = ~41,625 HARNESS tokens — 67%
 * over the cap. The calibration commit fixed every path that measures and left the one that cannot.
 *
 * Same class this SD keeps rediscovering: a stated bound that was sound against the quantity it was
 * derived from, and stopped being sound when that quantity was redefined. Derived now, so it moves
 * with the calibration instead of having to be remembered.
 */
const SINGLE_READ_SAFE_BYTES = Math.floor(SINGLE_READ_TOKEN_BUDGET / CL100K_TO_HARNESS);

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
 * Report a coverage percentage. FLOOR, never round.
 *
 * A coverage gauge must never round UP: overstating how much of a file was read is the entire
 * failure mode this module exists to prevent, and it should not sneak back in through a display
 * format. Flooring also keeps the reported number from CONTRADICTING the verdict — with rounding,
 * 493 of 520 lines is 94.81%, which the exact comparison correctly calls not-full while the display
 * rounded it to "95%" against a 95% bar. A gauge that reads 95% beside "not fully read" invites the
 * reader to assume the verdict is the broken half.
 *
 * DISPLAY ONLY. The threshold comparison uses the exact fraction; see unionPct below.
 */
function reportPct(exact) {
  return Math.floor(exact);
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
  // EXACT, not rounded. Rounding BEFORE the threshold comparison quietly moved the bar from 95% to
  // 94.5%: 493 of 520 lines is 94.81%, which rounds to 95 and passed. A threshold that the display
  // format can move is not a threshold.
  const exact = (Number(covered) / total) * 100;
  return Number.isFinite(exact) ? exact : null;
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
  /**
   * *** THE INVARIANT. READ THIS BEFORE CHANGING ANY ORDERING BELOW. ***
   *
   * Four defects were found in this function across four review passes, and TWO of them were
   * introduced by the fix for the previous one. Every single one was the same category error, not a
   * logic error: the signals here carry three DIFFERENT KINDS OF BOUND, and nothing said which was
   * which, so they got combined as though they were interchangeable.
   *
   *   deliveredRanges  LOWER bound on what was read   (measured — what each call returned)
   *   ranges           UPPER bound on what was read   (requested — you can get less, never more)
   *   lastDelivered    POINT SAMPLE of a single call  (bounds that call and nothing else)
   *
   * THE RULE THAT MAKES IT MECHANICAL:
   *   - only a LOWER bound may set fully_read = true;
   *   - an UPPER bound may only set fully_read = false (it can disprove completeness, never prove it);
   *   - a POINT SAMPLE bounds only its own call, never the file.
   *
   * Checked against the history: SEC-F12 applied a requested-semantics default (falsy limit means
   * to-EOF) to measured data. SEC-F13/F16 took the max of an upper bound and a lower bound, letting
   * a request outrank a measurement. SEC-F8 used a point sample to answer a whole-file question.
   * All four are excluded by the three lines above.
   */
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
  if (hasDelivered) {
    const pct = unionPct(status.deliveredRanges, denominator);
    if (pct !== null) {
      return { read: true, fully_read: pct >= FULL_COVERAGE_PCT, coverage_pct: reportPct(pct), basis: 'delivered_ranges' };
    }
  } else {
    const pct = unionPct(status.ranges, denominator);
    if (pct !== null) {
      // *** SEC-F18 — AN UPPER BOUND CANNOT PROVE COMPLETENESS, ONLY DISPROVE IT. ***
      // `ranges` records what was ASKED FOR. You cannot read more than you requested, but you can
      // read less, so its union is an UPPER bound on coverage. These three legacy shapes are
      // byte-identical to this code and only the last is a full read:
      //     Read(offset=1, limit=520) truncated at 166      -> union 100%
      //     3 pages requesting 200 each, each truncated     -> union 100%
      //     3 pages genuinely paginated and delivered       -> union 100%
      // So it is reported as evidence of INCOMPLETENESS when it falls short, and never as evidence
      // of completeness when it does not. Under-reporting a legacy session costs one re-read;
      // over-reporting ships an unread contract.
      return {
        read: true,
        fully_read: false,
        coverage_pct: reportPct(pct),
        basis: pct >= FULL_COVERAGE_PCT ? 'requested_ranges_unconfirmed' : 'requested_ranges_incomplete',
      };
    }
  }

  // *** KNOWN RESIDUAL #1: THE DELIVERED TIERS HAVE NO PRODUCER IN PRACTICE. MEASURED. ***
  // Everything above prefers deliveredRanges/lastDelivered, and in the live fleet NEITHER IS EVER
  // WRITTEN. Counted on the real state file: 0 of 13 tracked protocol files carry any delivered
  // evidence, across 1,371 recorded reads. The transcript shows why — a Read tool_result is
  // { tool_use_id, type, content: "<string>", is_error }, with the line counts appearing only inside
  // a human-readable truncation NOTICE in that string ("PARTIAL view — showing lines 1-301 of 371
  // total (26142 tokens, cap 25000)"), never as the structured totalLines/numLines/startLine fields
  // protocol-file-tracker.cjs:308-320 looks for.
  //
  // FR-5's premise — established by grepping transcripts for "totalLines" and finding 316 hits —
  // was a FALSE POSITIVE: those hits are source files that MENTION the field, not responses that
  // carry it. Grepping for a field name finds its own documentation.
  //
  // CONSEQUENCE, and it is not a defect in this module: for an OVER-CAP contract, no reader can
  // currently prove a full read, so the honest answer is "cannot confirm". That is what this now
  // returns, rather than accepting an upper bound as proof (SEC-F18). The real remedy is to make the
  // contracts fit — which is exactly SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001. The cheap improvement,
  // logged as a follow-up: PARSE the truncation notice out of the content string, which IS delivered
  // evidence, just not in the shape anyone assumed.
  //
  // *** KNOWN RESIDUAL #2, STATED RATHER THAN LEFT IMPLICIT (SEC-F14). ***
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
      coverage_pct: reportPct((Number(d.numLines) / Number(d.totalLines)) * 100),
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
