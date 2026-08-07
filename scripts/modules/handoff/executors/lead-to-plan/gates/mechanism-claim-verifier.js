/**
 * Mechanism-Claim Verifier Gate for LEAD-TO-PLAN (SD acceptance).
 * QF-20260727-982.
 *
 * THE FAILURE THIS EXISTS FOR — an endorsement chain that never became evidence. On 2026-07-27 a
 * worker observed a real symptom (an EPERM reap leaving an orphan worktree directory) and offered
 * a mechanism. The coordinator propagated it verbatim, twice. Adam generalised it into a law —
 * "the quota ratchets one direction only, so every EPERM reap permanently burns a slot". Solomon
 * endorsed it. Four parties, four rounds, and confidence rose at every step WHILE THE NUMBER OF
 * PEOPLE WHO HAD READ lib/worktree-quota.js STAYED AT ZERO.
 *
 * The mechanism was backwards. countActiveWorktrees returns listActiveWorktrees().length — git
 * REGISTRATIONS, not directories — and its own docblock says so outright. An orphan husk consumes
 * no quota slot at all. What finally broke the claim was not more review; it was someone needing
 * the number for an unrelated reason and opening the file.
 *
 * WHY IT IS SELF-SEALING, which is the part this gate is built against: by the time the claim
 * reached the SD spine it carried FOUR ENDORSEMENTS AND NO CITATIONS, and that combination makes
 * a claim LESS likely to be checked, not more — a reader sees consensus and reasonably economises.
 * Review converted one party's claim into four parties' conviction. Agreement among parties who
 * have all read the same nothing is worth nothing.
 *
 * DESIGN CONSTRAINTS TAKEN VERBATIM FROM THE FILED SCOPE:
 *   - Enforced where an SD is ACCEPTED, not where it is authored. Authoring-time nags are advice;
 *     acceptance is where the record becomes load-bearing.
 *   - Requires a NAME plus a FILE:LINE, never a boolean. "A boolean is a convention with extra
 *     steps and decays the way a lint decays" — anyone can set true; almost nobody will invent a
 *     plausible file:line for a function they did not open.
 *   - Fires ONLY on spines that actually make a mechanism claim (a file AND a function). An SD
 *     that asserts no mechanism has nothing to cite, and is untouched.
 *
 * Emergency bypass: LEO_DISABLE_MECHANISM_VERIFIER_GATE=1 (mirrors the subagent-evidence gate's
 * kill-switch convention), so a bad heuristic can never wedge the whole fleet.
 */

/** A source-file reference: the "names a file" half of a mechanism claim. */
const FILE_TOKEN = /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql)\b/g;
/** A call/function reference near that file: the "names a function" half. */
const FN_TOKEN = /\b[A-Za-z_$][\w$]*\s*\(|\bfunction\s+[A-Za-z_$][\w$]*/;
/** A citation: path/to/file.ext:LINE. A bare filename is NOT a citation — the line is the proof. */
const FILE_LINE = /\b[\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql):\d+\b/;
/** Inline prose form, so a verifier can be recorded without a metadata edit. */
const INLINE_VERIFIER = /verified\s+(?:at|in)\s+([\w.-]+(?:\/[\w.-]+)*\.(?:js|cjs|mjs|ts|tsx|sql):\d+)\s+by\s+([^\n,;.]{2,})/i;

/** The SD spine — the fields a downstream reader treats as settled fact. */
function spineText(sd = {}) {
  const parts = [sd.description, sd.scope, sd.rationale];
  for (const arr of [sd.strategic_objectives, sd.key_changes]) {
    if (Array.isArray(arr)) parts.push(...arr.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))));
  }
  return parts.filter(Boolean).join('\n');
}

/**
 * Mechanism claims in the spine: a named file with a named function near it.
 * Proximity (not whole-text co-occurrence) is deliberate — an SD that mentions a file in one
 * paragraph and a function in another has not asserted a mechanism about that file.
 */
export function findMechanismClaims(text) {
  const claims = [];
  for (const m of String(text || '').matchAll(FILE_TOKEN)) {
    const window = text.slice(Math.max(0, m.index - 200), m.index + m[0].length + 200);
    if (FN_TOKEN.test(window)) claims.push(m[0]);
  }
  return [...new Set(claims)];
}

/**
 * Verifiers: who read it, and at what file:line. Both halves required — a name without a citation
 * is an endorsement (the thing that failed), and a citation without a name has nobody accountable.
 */
export function findVerifiers(sd = {}) {
  const out = [];
  const records = sd.metadata?.mechanism_verifications;
  if (Array.isArray(records)) {
    for (const r of records) {
      const by = typeof r?.verified_by === 'string' ? r.verified_by.trim() : '';
      const at = typeof r?.verified_at === 'string' ? r.verified_at.trim() : '';
      if (by && FILE_LINE.test(at)) out.push({ by, at });
    }
  }
  const inline = INLINE_VERIFIER.exec(spineText(sd));
  if (inline) out.push({ by: inline[2].trim(), at: inline[1] });
  return out;
}

/**
 * GRANDFATHER CUTOFF — blocking applies to SDs authored from here on, not to the standing backlog.
 *
 * MEASURED BEFORE CHOOSING, because "narrow" was an assumption worth testing: of the 28 live SDs in
 * draft/in_progress/pending_approval, 17 assert a file+function mechanism and ZERO carry a citation.
 * Shipping this blocking on day one would have wedged 61% of the active population at acceptance —
 * and a gate that bricks the fleet on the day it lands gets switched off, permanently, which buys
 * the codebase nothing. The failure mode this targets lives in NEW spines being authored, so that
 * is where the teeth go; the backlog gets the same message as a warning and can be cited on contact.
 *
 * This is a rollout decision, not a softening: the predicate is identical for both cohorts, only the
 * verdict differs, and the cutoff is a date rather than a flag someone must remember to flip.
 */
export const GRANDFATHER_BEFORE = Date.parse('2026-07-28T00:00:00Z');

/** Pure core, so the verdict is testable without a handoff context. */
export function validateMechanismClaims(sd = {}, { grandfatherBefore = GRANDFATHER_BEFORE } = {}) {
  const claims = findMechanismClaims(spineText(sd));
  if (claims.length === 0) {
    return { pass: true, score: 100, max_score: 100, issues: [], warnings: [], details: { claims: [], verifiers: [] } };
  }
  const verifiers = findVerifiers(sd);
  if (verifiers.length > 0) {
    return {
      pass: true, score: 100, max_score: 100, issues: [],
      warnings: [`${claims.length} mechanism claim(s) cited by ${verifiers.map((v) => `${v.by} @ ${v.at}`).join('; ')}`],
      details: { claims, verifiers }
    };
  }
  const created = Date.parse(sd.created_at || '');
  const grandfathered = Number.isFinite(created) && created < grandfatherBefore;
  const message = `the spine asserts a mechanism about ${claims.join(', ')} with no named verifier. Endorsement is not evidence.`;
  if (grandfathered) {
    return {
      pass: true, score: 50, max_score: 100, issues: [],
      warnings: [`MECHANISM_CLAIM_UNVERIFIED (pre-existing SD, not blocked): ${message}`],
      details: { claims, verifiers: [], grandfathered: true }
    };
  }
  return {
    pass: false, score: 0, max_score: 100,
    issues: [`MECHANISM_CLAIM_UNVERIFIED: ${message}`],
    warnings: [], details: { claims, verifiers: [], grandfathered: false }
  };
}

/**
 * Create the mechanism-claim verifier gate.
 * @returns {Object} Gate configuration
 */
export function createMechanismClaimVerifierGate() {
  return {
    name: 'GATE_MECHANISM_CLAIM_VERIFIER',
    validator: async (ctx) => {
      console.log('\n🔬 GATE: Mechanism-Claim Verifier (a named file+function needs a named reader)');
      console.log('-'.repeat(50));
      const v = process.env.LEO_DISABLE_MECHANISM_VERIFIER_GATE;
      if (v === '1' || String(v).toLowerCase() === 'true') {
        console.log('   ⚠️  LEO_DISABLE_MECHANISM_VERIFIER_GATE active — bypassing');
        return { pass: true, score: 100, max_score: 100, issues: [], warnings: ['GATE_MECHANISM_CLAIM_VERIFIER BYPASSED via env'] };
      }
      const result = validateMechanismClaims(ctx.sd);
      if (result.details?.claims?.length === 0) console.log('   ✅ Spine asserts no file+function mechanism — nothing to cite');
      else if (result.pass) console.log(`   ✅ ${result.details.claims.length} mechanism claim(s), verifier named`);
      else console.log(`   ❌ ${result.issues[0]}`);
      return result;
    },
    required: true,
    remediation:
      'A mechanism claim naming a file and a function must record WHO read it and WHERE. Add to the SD: '
      + 'metadata.mechanism_verifications = [{ "verified_by": "<name>", "verified_at": "path/to/file.js:123" }] — '
      + 'or write "verified at path/to/file.js:123 by <name>" in the spine. A boolean attestation is not accepted: '
      + 'the file:line IS the evidence that someone opened it. If the claim cannot be cited, it should not be the '
      + 'spine of an SD. Emergency bypass: LEO_DISABLE_MECHANISM_VERIFIER_GATE=1.'
  };
}
