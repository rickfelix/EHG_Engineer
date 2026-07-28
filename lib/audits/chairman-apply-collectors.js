/**
 * Chairman-apply sweep — COLLECTORS (SD-LEO-INFRA-RETROSPECTIVE-SWEEP-EVERY-001).
 *
 * Pure row-shaping. Everything here takes plain objects already fetched by the caller and returns
 * plain objects; nothing here opens a connection, reads env, or touches the filesystem.
 *
 * WHY THESE LIVE IN lib/ RATHER THAN BESIDE THE CLI. Both of the real defects this module has had
 * were HERE, not in the verdict logic — a source-literal check that fed 19 rows an empty string,
 * and a hardcoded provenance flag that defeated the asymmetry at its only call site — and neither
 * was reachable by the test suite, because the suite could not import the file they lived in
 * without pulling in a Supabase client.
 *
 * The constraint that shaped this: the repo's unit tier LEAKS REAL PRODUCTION CREDENTIALS into test
 * processes (.env loads in the parent and pool:'forks' inherits it before setup can no-op it), so a
 * test importing anything that can construct a client is one typo from reaching production. Moving
 * the PURE half here — rather than exporting from the CLI — keeps the test import graph free of
 * dotenv and createClient entirely, so there is no reachable sink even if a fixture is wrong.
 */

import { membershipOf, approvalTextOf, namesObjects, matchesAuthorityPrefix } from './chairman-apply-sweep.js';

/**
 * THE SOURCE LITERALS, shared by producer and consumer.
 *
 * buildPopulation EMITS these and buildEvidence SWITCHES on them. Previously each side wrote the
 * string out by hand: both halves were pinned independently and the CONTRACT BETWEEN THEM was not
 * pinned at all, so changing the producer's literal silently routed SD rows down the free-text
 * branch — evidence extracted from an empty string, .sql path discarded. That is this module's
 * original shipped defect, mirrored onto the other arm, and it stayed invisible because every
 * fixture hand-built its own `source` value and therefore could not see the seam.
 * One constant removes the seam; the contract test below proves the two sides still agree.
 */
export const SOURCE = Object.freeze({
  SD: 'strategic_directives_v2',
  QUICK_FIX: 'quick_fixes',
  FEEDBACK: 'feedback',
});

export const SQL_ARTIFACT_RE = /[\w./-]+\.sql/i;

/**
 * THE FREE-TEXT ARM PREDICATE, PINNED — prose did not determine a number. Candidate readings
 * measured 256 (any "chairman" mention), 76 (chairman within 40 chars of apply/approve/gate),
 * 31 (explicit gate phrase) and 20 (gate phrase AND a DDL term, minus retro shells) over 1184 rows.
 *
 * PINNED = gate phrase AND DDL term, excluding "[Retro action items]" shells whose title is a bare
 * UUID. Rationale that selects it: this audit's subject is DDL a chairman had to APPLY, so a
 * chairman MENTION is not membership — the loose reading admitted "brand asset kit" and "chairman
 * decision queue flooded", which no chairman ever gated an apply on.
 */
export const QF_GATE_PHRASE_RE = /(chairman[- ]?(only|gated|apply|approval)|requires chairman|chairman must|awaiting chairman|chairman to apply)/i;
export const QF_DDL_TERM_RE = /\b(alter|create|drop|grant|revoke|enable|migration|ddl|rls|policy)\b/i;
/**
 * Retro-shell exclusion. Two mutations survive INDIVIDUALLY and are harmless alone, but they are
 * COUPLED and applying both is not: dropping the ^ anchor makes the phrase match anywhere in the
 * title, and testing against title+description instead of title alone widens it further. Together
 * they turn this into "mentions a retro anywhere", which would drop legitimate gated items whose
 * description merely QUOTES a retro. Neither is worth a fixture; the pair is worth knowing about
 * before anyone edits this line. Deliberately a comment and not a test, because a test asserting
 * two independently-harmless mutants would pin implementation rather than behaviour.
 */
export const QF_RETRO_SHELL_RE = /^\s*\[Retro action items\]/i;

export function isQuickFixMember(qf) {
  if (!qf) return false;
  const text = `${qf.title || ''} ${qf.description || ''}`;
  if (QF_RETRO_SHELL_RE.test(qf.title || '')) return false;
  return QF_GATE_PHRASE_RE.test(text) && QF_DDL_TERM_RE.test(text);
}

/**
 * The completion-flag arm, SCOPED BY CATEGORY rather than free text.
 * capture-completion-flags.js writes exactly two categories. Free-texting the whole table instead
 * matched 168 of 13637 rows and let this one arm supply 73% of the population — `feedback` holds
 * every kind of feedback, so a text predicate over it is not a completion-flag index, it is a search.
 */
export const COMPLETION_FLAG_CATEGORIES = Object.freeze(['completion_flag', 'completion_flag_witness']);
export const FLAG_GATE_RE = /(chairman[- ]?(only|gated|apply|approval)|requires chairman|awaiting chairman|unapplied migration|not applied)/i;

export function isCompletionFlagMember(row) {
  if (!row) return false;
  if (!COMPLETION_FLAG_CATEGORIES.includes(row.category)) return false;
  const text = `${row.title || ''} ${row.description || ''}`;
  return FLAG_GATE_RE.test(text) && QF_DDL_TERM_RE.test(text);
}

/** Union of the metadata arms. Membership is KEY-PRESENCE; false/prose ride along as dispositions. */
export function buildPopulation(sds, quickFixes, metadataArms, extraMetadataRows = []) {
  const byId = new Map();
  // ANY row that can carry metadata is a metadata source. Reading strategic_directives_v2 only made
  // 11 live gates structurally unreachable — including the audit's own flagship RLS case, whose
  // named .sql artifact lives on the PRD row while the SD row reported NO_ARTIFACT. Same gate,
  // different row type; the table it happens to sit in is not a property of the gate.
  const metadataRows = [
    ...(sds || []).map((sd) => ({ identifier: sd.sd_key, metadata: sd.metadata, status: sd.status, source: SOURCE.SD })),
    ...(extraMetadataRows || []),
  ];
  for (const sd of metadataRows) {
    for (const arm of metadataArms || []) {
      const m = membershipOf(sd.metadata, arm);
      if (!m) continue;
      if (!byId.has(sd.identifier)) {
        byId.set(sd.identifier, {
          identifier: sd.identifier, source: sd.source,
          status: sd.status, arms: [], dispositions: [], metadata: sd.metadata || {},
          // Stamped by the PRODUCER, which is the only place that knows how this row carries its
          // evidence. Every metadata-borne row reads its metadata regardless of which table it
          // came from — the table is not a property of the gate.
          evidenceText: approvalTextOf(sd.metadata),
        });
      }
      const row = byId.get(sd.identifier);
      row.arms.push(arm);
      row.dispositions.push(m.disposition);
      // apply_authority carries CHAIRMAN-ONLY as a PREFIX, never as the whole value — bare equality
      // on 'CHAIRMAN-ONLY non-delegatable' returns ZERO live and drops 2 SDs, both access-control
      // DDL. matchesAuthorityPrefix encoded that finding but was called by NOTHING: exported,
      // asserted by three tests, and dead in production. A control nobody invokes is not a control.
      if (arm === 'apply_authority') {
        row.chairmanOnly = matchesAuthorityPrefix((sd.metadata || {})[arm]);
      }
    }
  }
  // quick_fixes has NO metadata column at all — free-text only, so it is unreachable by any
  // metadata query and must be a separate arm rather than a filter over the same source.
  for (const qf of quickFixes || []) {
    if (!isQuickFixMember(qf)) continue;
    byId.set(qf.id, {
      identifier: qf.id, source: SOURCE.QUICK_FIX, status: qf.status,
      arms: ['quick_fixes_freetext'], dispositions: ['prose'], metadata: {},
      freeText: `${qf.title || ''} ${qf.description || ''}`,
      evidenceText: `${qf.title || ''} ${qf.description || ''}`,
    });
  }
  return [...byId.values()];
}

/** Completion flags live in `feedback`; without this arm they are unreachable entirely. */
export function addCompletionFlagArm(population, feedbackRows) {
  const byId = new Map((population || []).map((p) => [p.identifier, p]));
  for (const row of feedbackRows || []) {
    if (!isCompletionFlagMember(row)) continue;
    const key = `FEEDBACK-${row.id}`;
    if (byId.has(key)) continue;
    byId.set(key, {
      identifier: key, source: SOURCE.FEEDBACK, status: row.status,
      arms: ['completion_flag_index'], dispositions: ['prose'], metadata: {},
      freeText: `${row.title || ''} ${row.description || ''}`,
      evidenceText: `${row.title || ''} ${row.description || ''}`,
    });
  }
  return [...byId.values()];
}

/** Assemble the evidence the pure classifier consumes. No verdict logic lives here. */
export function buildEvidence(item) {
  // NO BRANCH. The producer stamps evidenceText because only it knows how a row carries evidence.
  // This consumer previously switched on a source LITERAL, and got it wrong TWICE for the same
  // reason: first every completion-flag row fell to approvalTextOf({}) === '' and 16 of 19 had a
  // .sql path discarded; then, once PRD and feedback METADATA rows were admitted, all 12 fell to a
  // `freeText` they do not have. A shared SOURCE constant fixed the literals and not the CATEGORY
  // ASSUMPTION — two kinds of row when there were three. The fallback below is for hand-built
  // fixtures only; production rows always arrive stamped.
  const approvalText = (item && item.evidenceText)
    || (item && item.freeText)
    || approvalTextOf(item && item.metadata);
  const objects = namesObjects(approvalText);
  const artifactMatch = approvalText.match(SQL_ARTIFACT_RE);
  return {
    approval: {
      namesObjects: objects.named,
      identifiers: objects.identifiers,
      // NOT INDEPENDENT, and saying so is the point. Both the approval and the artifact below are
      // extracted from THIS SAME STRING, so they share one origin — exactly the self-comparison the
      // asymmetry exists to reject. Hardcoding `true` here asserted the flag the lib checks and
      // silently defeated it: 21 rows would reach hasApproval with provenance never established the
      // moment a live prober lands. Real independence requires a second source (ledger/git/commit)
      // that FR-4 has not built yet; until then this is false, which changes ZERO rows today.
      provenanceIndependent: false,
    },
    artifact: { present: Boolean(artifactMatch), path: artifactMatch ? artifactMatch[0] : null },
    // Live probing is a follow-on capability; until it exists every row reports the reason that
    // says so, rather than inferring state from a file-level verifier that has no such class and
    // fails open toward APPLIED. An honest CLASS_UNPROBEABLE beats a fabricated APPLIED.
    live: { probed: false },
    secondaryArtifactSearchDone: false,
    secondaryArtifactFound: false,
  };
}
