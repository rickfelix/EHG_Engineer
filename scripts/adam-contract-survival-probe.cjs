#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 / FR-1 — does each imperative SURVIVE the move?
 *
 * *** WHY THIS EXISTS WHEN imperative-inventory.json ALREADY HAS A SCORE. ***
 * That file records, in its own probe_campaign block: "the automated score was falsified against
 * ground truth and is NOT used". It is still present on every entry, which makes it exactly the
 * kind of number a later reader trusts by accident. This script does not read match_score.
 *
 * *** AND WHY THE OPEN QUEUE IS INFLATED. *** The shortening moved content into two COMPANION
 * files. An imperative scored against the contract alone therefore reads as "missing" precisely
 * when it moved as designed. Survival has to be measured against the UNION of what a reader can
 * reach — contract + companions — or the measure punishes the intended outcome.
 *
 * THE MEASURE: normalized 5-gram shingle coverage. For each imperative, what fraction of its
 * 5-word shingles appear anywhere in the corpus. Chosen over a similarity score because it is
 * explainable per-entry (you can print the shingles that went missing) and has no tuned weights.
 *
 * *** THE MEASURE IS NOT TRUSTED UNTIL IT REPRODUCES KNOWN ANSWERS — run with --calibrate. ***
 * The SD supplies ground truth in both directions: two obligations CONFIRMED absent from the
 * approved shortening (the correlation_id courtesy-ACK prohibition and DECOMPOSE-WEAKEST-LAYER),
 * and restorations 5q/5r that are CONFIRMED present in the corrected contract. A measure that
 * cannot separate those has not earned a verdict on the 299 unknowns. This is the step whose
 * absence falsified the previous score.
 *
 * Usage:
 *   node scripts/adam-contract-survival-probe.cjs --calibrate     # prove the measure works
 *   node scripts/adam-contract-survival-probe.cjs                 # probe the open queue
 *   node scripts/adam-contract-survival-probe.cjs --json <path>   # write full results
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'docs', 'protocol', 'adam-contract-review-2026-07-29');
const ORIGINAL = path.join(DIR, 'CLAUDE_ADAM.ORIGINAL-2026-07-29.md');
const CORRECTED = path.join(DIR, 'CLAUDE_ADAM.CORRECTED-2026-07-29.md');
const PROPOSED = path.join(DIR, 'CLAUDE_ADAM.PROPOSED-2026-07-29.md');
const MANUAL = path.join(DIR, 'CLAUDE_ADAM_MANUAL.DRAFT-2026-07-29.md');
const PROVENANCE = path.join(DIR, 'CLAUDE_ADAM_PROVENANCE.DRAFT-2026-07-29.md');
const INVENTORY = path.join(DIR, 'imperative-inventory.json');

const SHINGLE = 5;
/** Coverage at/above this counts as SURVIVED. Set by --calibrate, not by taste. */
const SURVIVED_AT = 0.60;
/** Below this, the text is treated as genuinely absent rather than merely reworded. */
const ABSENT_BELOW = 0.25;

/**
 * Lowercase, strip markdown/punctuation, collapse whitespace. Rewording survives; formatting does not.
 *
 * HYPHENS BECOME SPACES, and that is not cosmetic. Calibration caught it: the contract writes
 * "ACCEPTANCE-SITTING OWNERSHIP" as a compound and the prose writes "acceptance sittings", so
 * keeping the hyphen scored a restored-and-present rule at 0% and would have reported it deleted.
 */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[`*_>#\[\]()|]/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shingles(text, n = SHINGLE) {
  const words = normalize(text).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  if (words.length < n) return [words.join(' ')];
  const out = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

/**
 * @returns {{shingles:Set<string>, text:string}} both views of the corpus. The flat normalized text
 * is needed because a probe SHORTER than the shingle width produces no 5-gram and could otherwise
 * never match anything — calibration reported three present rules as absent for exactly that reason.
 */
function buildCorpus(files) {
  const set = new Set();
  const parts = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    const raw = fs.readFileSync(f, 'utf8');
    for (const s of shingles(raw)) set.add(s);
    parts.push(normalize(raw));
  }
  return { shingles: set, text: parts.join(' ') };
}

/** @returns {{coverage:number, total:number, missing:string[]}} */
function coverage(imperative, corpus) {
  const words = normalize(imperative).split(' ').filter(Boolean);
  // Short probe: no 5-gram exists, so decide by containment instead of pretending to score.
  if (words.length < SHINGLE) {
    const hit = words.length > 0 && corpus.text.includes(words.join(' '));
    return { coverage: hit ? 1 : 0, total: 0, missing: hit ? [] : [words.join(' ')] };
  }
  const sh = shingles(imperative);
  if (sh.length === 0) return { coverage: 1, total: 0, missing: [] };
  const missing = sh.filter(s => !corpus.shingles.has(s));
  return { coverage: (sh.length - missing.length) / sh.length, total: sh.length, missing: missing.slice(0, 5) };
}

/**
 * *** THIS MEASURE IS ONE-SIDED, AND CALIBRATION IS WHAT PROVED IT. ***
 * A HIGH score is conclusive: the words are there, so the obligation is locatable.
 * A LOW score is NOT evidence of deletion. The landing is a REWRITE, not a partition — row 601 goes
 * 70,049 chars to ~6,000 and five SMS clauses are merged — so a surviving rule is routinely restated
 * in new words. Measured, not assumed: of four rules KNOWN to survive into the corrected contract,
 * two score 0% there (DECOMPOSE-WEAKEST-LAYER and ACCEPTANCE-SITTING OWNERSHIP), because the
 * restorations were reworded rather than copied.
 *
 * So this never returns ABSENT. Calling a 0% entry "deleted" is precisely the error that falsified
 * the previous automated score, and repeating it with better arithmetic would still be wrong.
 * The tool retires the entries it can PROVE survived and hands the rest to semantic review.
 */
function verdictFor(cov) {
  return cov >= SURVIVED_AT ? 'SURVIVED' : 'NEEDS_SEMANTIC_REVIEW';
}

/** Where an imperative can still be reached, so a survivor is not just "somewhere". */
function locate(imperative, corpora) {
  const hits = [];
  for (const [name, set] of Object.entries(corpora)) {
    if (coverage(imperative, set).coverage >= SURVIVED_AT) hits.push(name);
  }
  return hits;
}

// ── Ground truth. Both directions, from the SD's own confirmed findings. ────────────────────
// *** EVERY PROBE IS A VERBATIM QUOTE FROM THE ORIGINAL, NOT A PARAPHRASE. ***
// The first calibration run used paraphrases and scored 0% against the original for all five —
// which would have "confirmed" every deletion regardless of the corpus, because it was measuring my
// own wording rather than the document. The anchored-in-ORIGINAL check now fails loudly on that.
const GROUND_TRUTH = [
  {
    label: 'correlation_id courtesy-ACK prohibition',
    // CONFIRMED DELETED by the approved shortening; CLAUDE_SOLOMON.md keeps it, so landing the
    // approved file as-is voids it for Adam alone on a channel the two roles SHARE.
    probe: 'NEVER courtesy-ACK that correlation_id afterward',
    expect_in_proposed: 'ABSENT',
  },
  {
    label: 'DECOMPOSE-WEAKEST-LAYER (restored as 5r)',
    // The named rule was COINED in the restoration; the original states it as prose, so the probe
    // has to quote the prose or it tests the new name against the old document.
    probe: "weakest LAYER holds N weak (unbuilt/partial) capabilities",
    expect_in_proposed: 'ABSENT',
    expect_in_corrected: 'PRESENT',
  },
  {
    label: 'ACCEPTANCE-SITTING OWNERSHIP (restored as 5q)',
    probe: 'when the chairman delegates acceptance sittings, Adam owns them end-to-end',
    expect_in_proposed: 'ABSENT',
    expect_in_corrected: 'PRESENT',
  },
  {
    label: 'Adam/EVA persona split (restored into section 1)',
    probe: "Adam = the chairman's HARNESS-side interface + Chief Builder; EVA = the chairman's VENTURE-side chief-of-staff",
    expect_in_proposed: 'ABSENT',
    expect_in_corrected: 'PRESENT',
  },
];

function runCalibration() {
  const proposed = buildCorpus([PROPOSED]);
  const corrected = buildCorpus([CORRECTED]);
  const original = buildCorpus([ORIGINAL]);

  console.log('CALIBRATION — the measure must reproduce known answers before it may issue verdicts.\n');
  let failures = 0;
  let rewriteBlind = 0;

  for (const gt of GROUND_TRUTH) {
    // Every probe must first be FINDABLE IN THE ORIGINAL. A probe that misses there is testing my
    // own phrasing, not the corpus — the failure mode that lets a broken measure look calibrated.
    const inOriginal = coverage(gt.probe, original);
    const anchored = inOriginal.coverage >= SURVIVED_AT;

    let line = `  ${anchored ? '✓' : '✗'} anchored in ORIGINAL (${(inOriginal.coverage * 100).toFixed(0)}%)`;
    if (!anchored) failures++;

    // THE ONLY CLAIM THIS MEASURE MAY MAKE: a confirmed-deleted rule must never score SURVIVED.
    // No assertion runs the other way, because a low score is not evidence of deletion.
    if (gt.expect_in_proposed === 'ABSENT') {
      const c = coverage(gt.probe, proposed);
      const falsePositive = verdictFor(c.coverage) === 'SURVIVED';
      if (falsePositive) failures++;
      line += ` | PROPOSED no-false-SURVIVED (${(c.coverage * 100).toFixed(0)}%) ${falsePositive ? '✗' : '✓'}`;
    }

    // Rewrite-blindness, MEASURED rather than asserted. These rules are known to be present in the
    // corrected contract; wherever the score cannot see them, that is the tool's blind spot and it
    // is reported as a limit of the instrument, not as a failure of the document.
    if (gt.expect_in_corrected === 'PRESENT') {
      const c = coverage(gt.probe, corrected);
      const seen = verdictFor(c.coverage) === 'SURVIVED';
      if (!seen) rewriteBlind++;
      line += ` | CORRECTED known-present, lexically ${seen ? 'VISIBLE' : 'INVISIBLE (reworded)'} (${(c.coverage * 100).toFixed(0)}%)`;
    }
    console.log(`${gt.label}\n${line}\n`);
  }

  const rewriteTotal = GROUND_TRUTH.filter(g => g.expect_in_corrected === 'PRESENT').length;
  if (failures > 0) {
    console.log(`CALIBRATION FAILED (${failures} mismatch(es)). The measure has NOT earned a verdict on the open queue.`);
    process.exitCode = 1;
  } else {
    console.log('CALIBRATION PASSED — no confirmed deletion scores as SURVIVED, and every probe is anchored in the original.');
    console.log(`\nMEASURED BLIND SPOT: ${rewriteBlind} of ${rewriteTotal} rules KNOWN to survive into the corrected`);
    console.log('contract are lexically invisible there, because the restorations were reworded rather than');
    console.log('copied. That is why this tool never reports ABSENT: at this blind rate, a low score carries');
    console.log('almost no information about deletion. SURVIVED retires an entry; everything else needs a reader.');
  }
}

function runProbe(jsonOut) {
  const inv = JSON.parse(fs.readFileSync(INVENTORY, 'utf8'));
  const open = inv.entries.filter(e => e.disposition === 'NEEDS_DECISION');

  const corpora = {
    contract: buildCorpus([CORRECTED]),
    manual: buildCorpus([MANUAL]),
    provenance: buildCorpus([PROVENANCE]),
  };
  const union = buildCorpus([CORRECTED, MANUAL, PROVENANCE]);

  const results = open.map(e => {
    const c = coverage(e.imperative, union);
    return {
      key: e.key,
      carries_modal: !!e.carries_modal,
      coverage: Number(c.coverage.toFixed(3)),
      verdict: verdictFor(c.coverage),
      reachable_in: locate(e.imperative, corpora),
      missing_shingles: c.missing,
      imperative: e.imperative,
    };
  });

  const tally = {};
  for (const r of results) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  const modalTally = {};
  for (const r of results.filter(r => r.carries_modal)) modalTally[r.verdict] = (modalTally[r.verdict] || 0) + 1;

  console.log(`OPEN QUEUE RE-PROBED AGAINST contract + companions (${open.length} entries)\n`);
  console.log('  all open      :', JSON.stringify(tally));
  console.log('  modal-bearing :', JSON.stringify(modalTally), `(of ${results.filter(r => r.carries_modal).length})`);

  const reach = {};
  for (const r of results.filter(r => r.verdict === 'SURVIVED')) {
    const k = r.reachable_in.length ? r.reachable_in.join('+') : 'union-only';
    reach[k] = (reach[k] || 0) + 1;
  }
  console.log('  survivors by file:', JSON.stringify(reach));

  const atRisk = results
    .filter(r => r.verdict !== 'SURVIVED')
    .sort((a, b) => (b.carries_modal - a.carries_modal) || (a.coverage - b.coverage));

  console.log(`\n── NOT CONFIRMED SURVIVING (${atRisk.length}) — modal-bearing first ──`);
  for (const r of atRisk.slice(0, 40)) {
    console.log(`  [${r.verdict}] ${r.carries_modal ? 'MODAL ' : '      '}${(r.coverage * 100).toFixed(0).padStart(3)}%  ${r.imperative.slice(0, 150).replace(/\s+/g, ' ')}`);
  }
  if (atRisk.length > 40) console.log(`  … ${atRisk.length - 40} more (use --json for the full set)`);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({
      measure: `normalized ${SHINGLE}-gram shingle coverage vs contract+companions`,
      thresholds: { survived_at: SURVIVED_AT, absent_below: ABSENT_BELOW },
      calibrated_against: GROUND_TRUTH.map(g => g.label),
      tally, modal_tally: modalTally, results,
    }, null, 2));
    console.log(`\nwrote ${jsonOut}`);
  }
}

const args = process.argv.slice(2);
if (args.includes('--calibrate')) runCalibration();
else runProbe(args.includes('--json') ? args[args.indexOf('--json') + 1] : null);
