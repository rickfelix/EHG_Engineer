/**
 * Does this write REPLACE claude_sessions.metadata, or MERGE into it?
 * SD-LEO-INFRA-PERSIST-MONITOR-OBSERVED-001 (re-scoped) — pure classifier.
 *
 * THE HAZARD. metadata is a JSONB column and a PostgREST write REPLACES it wholesale. A writer
 * that carries only the keys it cares about silently deletes every key it did not carry.
 *
 * WHY THAT IS WORSE THAN A WRONG VALUE, which is the whole reason this file exists. Drop
 * fleet_identity.callsign and sessionIdentityKind() returns null (server/routes/fleet-panel.js:54-79),
 * and :204 filters the row OUT of the Sessions page. Every other defect in this family reports a
 * wrong value; this one produces an ABSENT ROW. An absent row does not read as an error — it reads
 * as nothing-wrong, because nobody counts the rows they cannot see. The seat most likely to be lost
 * this way is a stuck one, which is the seat we most need to find.
 *
 * IT HAS ALREADY BITTEN SIX TIMES, and every one of those authors wrote a warning comment:
 *   scripts/hooks/lib/session-telemetry-writer.cjs:241  lib/session-writer.cjs:88
 *   lib/checkin/steps/model-effort-merge.cjs:16          lib/fleet/spawn-control.js:465
 *   lib/session-manager.mjs:365                          scripts/hooks/capture-session-id.cjs:359
 * Six comments did not stop the seventh writer. A WARNING COMMENT IS NOT A GUARD. Enforcement is
 * the only thing that has not been tried, which is what this module is for.
 *
 * CLASSIFY BY CAPABILITY, NOT BY VERB — the correction that makes this guard worth having.
 * The obvious rule is "fail on .update()". Prospective testing (evidence 9b5c3844) showed the two
 * HIGHEST-VOLUME replacing writers are neither .update() nor PATCH:
 *   - scripts/hooks/capture-session-id.cjs:418  POST + Prefer: resolution=merge-duplicates
 *   - lib/session-manager.mjs:398/:422          .upsert({...}, {onConflict:'session_id'})
 * Both replace the whole column. A verb-based guard reports clean while the two worst offenders
 * ship. So the question this module asks is never "which verb" but "CAN THIS WRITE REPLACE".
 */

/**
 * ─── WHAT THIS MODULE CANNOT SEE ────────────────────────────────────────────────────────────────
 * READ THIS BEFORE WIRING IT INTO ANYTHING. Two independent sub-agent reviews (TESTING 7343de5c,
 * SECURITY fad2af85) enumerated these; they are stated here rather than in a commit message because
 * the person who wires this up will read the module, not the history.
 *
 * DO NOT wire classifyFile into a gate, or use it to support a "the tree is clean" claim, until the
 * misses below are closed. Zero findings from this module means NOT PARSED at least as often as it
 * means CLEAN, and a clean-looking gauge that cannot see is precisely the defect this SD exists to
 * eliminate. Reporting it as coverage would reproduce that defect one level up.
 *
 * KNOWN MISSES, each verified against a real file rather than hypothesised:
 *   1. HOISTED PAYLOAD — `const body = JSON.stringify({metadata});` … `fetch(url, {body})`. The
 *      payload check scans forward from the call, so a payload built earlier is invisible.
 *   2. TABLE BEHIND A CONST — session-telemetry-writer.cjs:27 binds TELEMETRY_TABLE='claude_sessions'
 *      and PATCHes at :139/:218. No literal near the write, so no proximity match.
 *   3. PROXIMITY_LINES=40 IS TOO NARROW FOR SOME REAL FILES — capture-session-id.cjs has its URL at
 *      :357 and the write at :423, a 66-line gap. Both 1 and 3 apply to that file, which is why it
 *      returns zero findings DESPITE being named at the top of this module as the reason it exists.
 *      That contradiction is left visible on purpose: it is the honest state of the tool.
 *   4. RAW SQL — `UPDATE claude_sessions SET metadata = …` matches no REPLACING_FORM, so this module
 *      can distinguish neither a raw clobber nor a raw merge. The compliant writers use exactly this
 *      channel, which is why they show zero findings rather than a MERGE verdict.
 *   5. `/*` inside a string literal blanks source to the next close-comment.
 *
 * DELIBERATE GENEROSITY, documented so it is not mistaken for an oversight: a payload that carries a
 * variable forward is called read_then_write whenever the surrounding context reads metadata at all.
 * That can under-report a replace. It is the right direction to err — read_then_write is still
 * REPORTED, and a guard that accuses the canonical safe helper gets switched off wholesale, taking
 * its true findings with it.
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 */

'use strict';

/** The write forms that can replace a JSONB column outright. */
const REPLACING_FORMS = [
  { form: 'update', re: /\.update\s*\(/ },
  { form: 'upsert', re: /\.upsert\s*\(/ },
  { form: 'post_merge_duplicates', re: /resolution\s*=\s*merge-duplicates/ },
  { form: 'raw_patch', re: /method\s*:\s*['"]PATCH['"]/ },
];

/**
 * Forms that merge server-side and therefore cannot destroy siblings.
 * `||` is the jsonb concat operator: the existing object wins nothing, but every existing key
 * survives unless explicitly overwritten. jsonb_set is listed for completeness; note it currently
 * has ZERO live callers against this column, so `||` is the only form actually in use.
 */
/*
 * THE `||` HERE IS THE SQL JSONB CONCAT OPERATOR, NOT JAVASCRIPT'S LOGICAL OR — and conflating the
 * two produced a FALSE GREEN, which is the one failure this guard must never have.
 * The first version matched bare `metadata ||`. In JS, `metadata || {}` is the ordinary defensive
 * null-coalesce idiom and appears all over these writers, so a blind-replacing writer that happened
 * to contain it was classified MERGE and reported compliant. A guard that calls a replace a merge is
 * worse than no guard: it adds false assurance on top of the original defect.
 * Both patterns below therefore require an unambiguously SQL-side token — `::jsonb` (a Postgres
 * cast, which cannot appear in a JS expression) or a SET clause. JS `||` cannot satisfy either.
 */
const MERGE_FORMS = [
  // THIRD ALTERNATIVE REMOVED, and its removal is the same lesson twice.
  // It was `SET[^\n]*metadata[^\n]*\|\|/i` — case-insensitive, so it matched ordinary JavaScript:
  // `const setMetadata = (row) => row.metadata || {}` satisfies SET…metadata…||. That is the exact
  // false-green class the regression test below already pins; I closed two alternatives and left a
  // third open in the same literal. A live instance exists at attention-flag-writer.js:111.
  // Only `::jsonb` survives as a discriminator: it is a Postgres cast and cannot appear in a JS
  // expression, so it cannot be produced by accident.
  { form: 'jsonb_concat_merge', re: /\|\|[^\n]*::jsonb|::jsonb[^\n]*\|\|/ },
  { form: 'jsonb_set', re: /jsonb_set\s*\(/i },
];

/**
 * A payload that carries an existing object forward preserves whatever that object held.
 * TWO SHAPES, and missing the second one flagged the canonical SAFE helper as a defect:
 *   metadata: { ...existing, k: v }   ← spread, obvious
 *   metadata: mergedMetadata          ← a variable built from a read, equally safe and far commoner
 * TESTING (evidence 9b5c3844) named this: the dominant shape is `.update({ metadata })` with an
 * identifier, so safety is a property of HOW THE VARIABLE WAS BUILT, not of the call site. Full
 * dataflow is beyond a static guard; the tractable proxy is whether this file reads existing
 * metadata at all. That is deliberately generous — it can call a replace a read-then-write if the
 * file happens to read elsewhere. Erring that way is correct here: read_then_write is still
 * REPORTED, just not failed, so a generous boundary loses a warning rather than manufacturing a
 * false green, and a guard that cries wolf on the safe helper gets disabled wholesale.
 */
const CARRIES_FORWARD_RE = /metadata\s*:\s*\{\s*\.\.\.|metadata\s*:\s*\w*[Mm]erged\w*|metadata\s*:\s*\w*[Ff]resh\w*|metadata\s*[,}]/;
/** ...but only if this file actually READS existing metadata somewhere. */
const READS_EXISTING_RE = /\.select\s*\(\s*['"`][^'"`]*metadata|readSessionMetadata|getSessionMetadata|existingMetadata|currentMetadata|\bmetadata\s*=\s*(?:data|row|existing)/i;

/**
 * Comments quoting the hazard are not the hazard.
 * Six files carry warning comments containing literal `.update({ metadata: ... })` examples, and
 * flagging those made the guard report its own documentation as a defect — noise that gets a guard
 * switched off, which is the TR-3 failure mode. Strip comments before classifying.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))   // keep line numbering intact
    // `[^\S\r\n]*` is "horizontal whitespace only". It was `\s*`, and THAT DELETED LINES:
    // with /m, \s matches \n, so the leading class ate the preceding newline(s) and
    // ' '.repeat() replaced them with spaces. 172 lines vanished from session-manager.mjs and 195
    // from capture-session-id.cjs. Two consequences, both fatal to a guard whose only product is a
    // citation: EVERY reported file:line was wrong (session-manager.mjs:398 reported as :321), and
    // capture-session-id.cjs fell out of the proximity window entirely — so the guard returned ZERO
    // findings for the file this module's own header names as its reason for existing.
    // THE TELL WAS AN INTERNAL CONTRADICTION I SHOULD HAVE CAUGHT: the header hand-cites :398/:422
    // while the tool emitted :321/:343. When a tool disagrees with its own documentation about the
    // same file, one of them is wrong and it is worth ten seconds to find out which.
    .replace(/^[^\S\r\n]*(?:\/\/|\*|#)[^\n]*$/gm, (m) => ' '.repeat(m.length));
}

const TABLE_RE = /claude_sessions/;
/** A payload that carries metadata at all. Without this, a write to other columns is irrelevant. */
const CARRIES_METADATA_RE = /metadata\s*[:=]/;

/**
 * How far from a `claude_sessions` mention a write form still counts as being ABOUT that table.
 * Deliberately generous: PostgREST fetch calls put the table in the URL many lines above the body.
 */
const PROXIMITY_LINES = 40;

/**
 * Sibling keys observed live on claude_sessions.metadata across active worker seats.
 *
 * THIS IS A CENSUS, NOT A COMPUTED DESTRUCTION LIST — and the distinction is load-bearing.
 * For `{...metadataVar, k: v}` the set actually destroyed is a RUNTIME fact: nothing if the spread
 * is fresh, everything if it is stale. Emitting a "computed" list this module did not compute would
 * be a name making a claim the implementation cannot support — the same defect class as the false
 * QF-20260727-488 citation this SD struck. So the guard reports what is AT RISK, and says so.
 */
const AT_RISK_KEY_CENSUS = [
  'fleet_identity', 'model', 'effort', 'tier_rank', 'model_family', 'model_source', 'effort_source',
  'role', 'is_coordinator', 'auto_proceed', 'chain_orchestrators', 'wind_down', 'launch_cwd',
  'wake_armed_at', 'expected_wake_at', 'window_handle', 'window_owner_pid',
];

/** Verdicts, ordered by how much they should worry you. */
const VERDICT = {
  MERGE: 'merge',                    // server-side merge; cannot destroy siblings
  READ_THEN_WRITE: 'read_then_write', // preserves keys it saw; still races a concurrent writer
  REPLACE: 'replace',                 // destroys every key not carried — the defect
};

/**
 * Classify one source file's writes to claude_sessions.metadata.
 *
 * Pure: source text in, findings out. No filesystem, no DB, no cwd — so the tests that exercise it
 * cannot pass or fail for an ambient reason, which is how three sibling tests in this repo ended up
 * reading real session state instead of their own fixtures.
 *
 * @param {string} source   file contents
 * @param {string} filePath repo-relative path, used only for reporting
 * @returns {Array<{file:string, line:number, form:string, verdict:string, at_risk_keys:string[], evidence:string}>}
 */
function classifyFile(rawSource, filePath) {
  if (typeof rawSource !== 'string' || !TABLE_RE.test(rawSource)) return [];

  const source = stripComments(rawSource);
  const lines = source.split('\n');
  const tableLines = [];
  lines.forEach((l, i) => { if (TABLE_RE.test(l)) tableLines.push(i); });
  if (tableLines.length === 0) return [];

  const findings = [];

  for (const { form, re } of REPLACING_FORMS) {
    lines.forEach((line, i) => {
      if (!re.test(line)) return;
      // Is this write about claude_sessions at all?
      if (!tableLines.some((t) => Math.abs(t - i) <= PROXIMITY_LINES)) return;

      // Does the payload carry metadata? Look at the call and the lines that follow it, because
      // the payload is usually an object spanning several lines.
      const window = lines.slice(i, Math.min(i + PROXIMITY_LINES, lines.length)).join('\n');
      if (!CARRIES_METADATA_RE.test(window)) return;

      const context = lines
        .slice(Math.max(0, i - PROXIMITY_LINES), Math.min(i + PROXIMITY_LINES, lines.length))
        .join('\n');

      let verdict = VERDICT.REPLACE;
      // MERGE IS JUDGED ON THE STATEMENT, NOT THE NEIGHBOURHOOD.
      // This tested `context` (±40 lines). One correct `|| $2::jsonb` anywhere nearby therefore
      // relabelled every blind replace within an ~80-line blast radius as compliant — reproduced by
      // adding a blind .update() just below the correct merge in attention-flag-writer.js. That is
      // the likeliest real regression path there is: a new writer added next to the right one.
      // read_then_write still judges on `context`, because reading IS a file-level property; a
      // merge is a property of the single statement performing it.
      if (MERGE_FORMS.some((m) => m.re.test(window))) {
        verdict = VERDICT.MERGE;
      } else if (CARRIES_FORWARD_RE.test(window) && READS_EXISTING_RE.test(context)) {
        // Spreads something it actually read. Preserves the keys it saw; still loses a write that
        // landed between the read and the write (the 3c40949b incident, 9 minutes).
        verdict = VERDICT.READ_THEN_WRITE;
      }

      findings.push({
        file: filePath,
        line: i + 1,
        form,
        verdict,
        at_risk_keys: verdict === VERDICT.REPLACE ? [...AT_RISK_KEY_CENSUS] : [],
        evidence: line.trim().slice(0, 160),
      });
    });
  }

  return findings;
}

/**
 * Human-readable failure text. Names the writer AND what is at risk, because "violation found"
 * tells the next reader nothing about why they should care.
 */
function formatFinding(f) {
  if (f.verdict !== VERDICT.REPLACE) return `${f.file}:${f.line} [${f.form}] ${f.verdict}`;
  return [
    `${f.file}:${f.line} — ${f.form} REPLACES claude_sessions.metadata`,
    `    ${f.evidence}`,
    `    AT RISK (live key census, not a computed destruction list): ${f.at_risk_keys.join(', ')}`,
    '    Losing fleet_identity.callsign removes the row from the Sessions page entirely',
    '    (server/routes/fleet-panel.js:204 filters on identity_kind !== null).',
    '    FIX: merge server-side — see lib/fleet/attention-flag-writer.js:45',
    "         metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb",
  ].join('\n');
}

module.exports = {
  classifyFile,
  formatFinding,
  VERDICT,
  AT_RISK_KEY_CENSUS,
  REPLACING_FORMS,
  MERGE_FORMS,
  PROXIMITY_LINES,
};
