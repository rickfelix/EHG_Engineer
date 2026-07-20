// Decision-binding disposition primitive (SD-LEO-INFRA-DECISION-BINDING-PRIMITIVE-001).
//
// Binds any gating decision (chairman ratification, Solomon/Adam consult answer,
// future dispatch-auth) to the state it unblocks, keyed on a session-stable,
// CONTENT-derived question_key -- never on correlation_id/message_id, which
// rotate per session and are exactly why a re-asked question was invisible to
// dedup.
//
// Storage: system_events (non-DDL Phase-1). idempotency_key = question_key gives
// a DATABASE-ENFORCED unique constraint for dedup, stronger than app-level
// checking alone. event_type='DECISION_DISPOSITION' distinguishes rows from
// every other system_events consumer. actor_role is left null so the
// dual_domain_governance trigger takes its no-governance-required default path.

import { createHash } from 'node:crypto';
import { validateWaveDisposition, applyWaveDisposition } from '../roadmap/wave-disposition.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: listAwaitingDisposition returns the
// full awaiting_disposition queue for consumers to act on; a silent 1000-row cap would hide pending
// dispositions on the growing system_events table. Paginate (fail-closed: query error still throws).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const EVENT_TYPE = 'DECISION_DISPOSITION';

// domain_acquisition added by SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001 FR-4
// (consumed-exactly-once purchase binding, subject {venture_id, domain}).
// plan_ratification added by SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001: chairman
// PLAN-affecting ratifications (subject {workstream}) REQUIRE a wave
// disposition — distinct from 'ratification', which is the artifact/fixture
// class (value-authenticity, APA fixtures) and stays wave-exempt.
const VALID_DECISION_TYPES = ['ratification', 'consult_answer', 'dispatch_auth', 'domain_acquisition', 'plan_ratification'];
const VALID_STATUSES = ['awaiting_disposition', 'dispositioned', 'consumed'];

/**
 * Canonicalize a subject payload into a stable string for hashing: sorted
 * keys, JSON-stringified. Order-independent so {a:1,b:2} and {b:2,a:1} hash
 * identically.
 */
function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

/**
 * Derive a session-stable, content-derived question_key. NEVER reads
 * correlation_id or message_id -- those rotate per session, which is the
 * exact bug this primitive fixes.
 *
 * @param {'ratification'|'consult_answer'|'dispatch_auth'|'domain_acquisition'} decisionType
 * @param {object} subject - decision-type-specific identifying content:
 *   ratification: { fixture_set_id, fixture_id }
 *   consult_answer: { question_text }
 *   dispatch_auth: { subject_id, gate_type }
 *   domain_acquisition: { venture_id, domain }
 *   plan_ratification: { workstream }
 * @returns {string} a stable "dq_<sha256-hex>" key
 */
export function computeQuestionKey(decisionType, subject) {
  if (!VALID_DECISION_TYPES.includes(decisionType)) {
    throw new Error(`computeQuestionKey: invalid decisionType "${decisionType}"`);
  }
  if (!subject || typeof subject !== 'object') {
    throw new Error('computeQuestionKey: subject must be an object');
  }
  const canonical = `${decisionType}::${canonicalize(subject)}`;
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `dq_${hash}`;
}

function assertSupabase(supabase) {
  if (!supabase || typeof supabase.from !== 'function') {
    throw new Error('disposition.js: a Supabase client instance is required');
  }
}

/**
 * Record a disposition. If a row already exists for this question_key
 * (dedup), the EXISTING row is returned unchanged -- recordDisposition never
 * silently overwrites a prior decision. To transition an existing row's
 * status, use updateDispositionStatus().
 *
 * @param {object} supabase - Supabase client (service-role)
 * @param {object} params
 * @param {'ratification'|'consult_answer'|'dispatch_auth'} params.decisionType
 * @param {object} params.subject - identifying content, see computeQuestionKey
 * @param {string} params.decisionKey - human-readable (subject_id, decision_type) label
 * @param {string} [params.authority] - who decided (chairman|coordinator|session id)
 * @param {object} [params.answerPayload] - polymorphic decision payload
 * @param {'awaiting_disposition'|'dispositioned'} [params.status] - defaults to
 *   'awaiting_disposition' unless answerPayload is provided, in which case
 *   defaults to 'dispositioned' (a decision recorded WITH an answer is already decided).
 * @returns {Promise<{row: object, created: boolean}>}
 */
export async function recordDisposition(supabase, {
  decisionType,
  subject,
  decisionKey,
  authority = null,
  answerPayload = null,
  status,
  waveDisposition = null,
}) {
  assertSupabase(supabase);
  const questionKey = computeQuestionKey(decisionType, subject);
  const resolvedStatus = status || (answerPayload ? 'dispositioned' : 'awaiting_disposition');
  if (!VALID_STATUSES.includes(resolvedStatus)) {
    throw new Error(`recordDisposition: invalid status "${resolvedStatus}"`);
  }

  // SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001: a plan ratification without an explicit
  // wave disposition is unrecordable — validated BEFORE any row is written so
  // the negative path leaves no partial state. Throws with usage guidance.
  const waveVerdict = decisionType === 'plan_ratification'
    ? validateWaveDisposition(waveDisposition)
    : null;

  const existing = await getDisposition(supabase, questionKey);
  if (existing) {
    if (waveVerdict) {
      // Repair path (adversarial review, SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001):
      // a prior call may have committed the disposition row and then failed
      // applying the durable wave effect. applyWaveDisposition is idempotent
      // (dup insert resolves to the existing item; the stamp is harmless), so
      // re-applying on the dedup path makes retry actually heal instead of
      // short-circuiting the effect away forever.
      await applyWaveDisposition(supabase, {
        waveDisposition,
        sourceKey: subject.workstream ?? questionKey,
        title: decisionKey ?? subject.workstream ?? questionKey,
        dispositionSource: 'plan_ratification',
      });
    }
    return { row: existing, created: false };
  }

  const nowIso = new Date().toISOString();
  const insertRow = {
    event_type: EVENT_TYPE,
    idempotency_key: questionKey,
    payload: {
      question_key: questionKey,
      decision_type: decisionType,
      decision_key: decisionKey ?? null,
      subject,
      status: resolvedStatus,
      authority,
      decided_at: resolvedStatus === 'awaiting_disposition' ? null : nowIso,
      answer_payload: answerPayload,
      ...(waveVerdict ? { wave_disposition: waveVerdict } : {}),
    },
  };

  const { data, error } = await supabase
    .from('system_events')
    .insert(insertRow)
    .select()
    .single();

  if (error) {
    // Unique-violation race: another writer inserted the same question_key
    // between our getDisposition() check and this insert. Read back and
    // return the winner instead of surfacing a spurious failure.
    if (error.code === '23505') {
      const winner = await getDisposition(supabase, questionKey);
      if (winner) return { row: winner, created: false };
    }
    throw new Error(`recordDisposition: insert failed: ${error.message}`);
  }

  if (waveVerdict) {
    // Durable effects: wave item (when a wave was chosen) + roadmap freshness
    // stamp. The disposition row above is the source of truth; applyWaveDisposition
    // is idempotent AND re-runs on the dedup path above, so a failure here is
    // genuinely retryable — call recordDisposition again with the same args.
    // sourceKey uses the WORKSTREAM (not question_key) so the orchestrator
    // creation path and this path share one item identity per workstream/sd_key.
    await applyWaveDisposition(supabase, {
      waveDisposition,
      sourceKey: subject.workstream ?? questionKey,
      title: decisionKey ?? subject.workstream ?? questionKey,
      dispositionSource: 'plan_ratification',
    });
  }

  return { row: data, created: true };
}

/**
 * Read back a disposition by question_key. Returns null (never throws) when
 * no row exists -- fail-closed: absence of a row is never authorized-by-default.
 *
 * @param {object} supabase
 * @param {string} questionKey
 * @returns {Promise<object|null>}
 */
export async function getDisposition(supabase, questionKey) {
  assertSupabase(supabase);
  const { data, error } = await supabase
    .from('system_events')
    .select('*')
    .eq('event_type', EVENT_TYPE)
    .eq('idempotency_key', questionKey)
    .maybeSingle();

  if (error) {
    throw new Error(`getDisposition: query failed: ${error.message}`);
  }
  return data ?? null;
}

/**
 * Look up a disposition by decisionType + subject content (computes the
 * question_key internally). Convenience wrapper over getDisposition().
 */
export async function getDispositionBySubject(supabase, decisionType, subject) {
  return getDisposition(supabase, computeQuestionKey(decisionType, subject));
}

/**
 * Transition an existing disposition's status (e.g. dispositioned -> consumed
 * once the bound blocked-state has acted on the decision).
 *
 * @returns {Promise<object>} the updated row
 */
export async function updateDispositionStatus(supabase, questionKey, newStatus, { answerPayload, authority } = {}) {
  assertSupabase(supabase);
  if (!VALID_STATUSES.includes(newStatus)) {
    throw new Error(`updateDispositionStatus: invalid status "${newStatus}"`);
  }
  const existing = await getDisposition(supabase, questionKey);
  if (!existing) {
    throw new Error(`updateDispositionStatus: no disposition found for question_key ${questionKey}`);
  }

  const nowIso = new Date().toISOString();
  const nextPayload = {
    ...existing.payload,
    status: newStatus,
    decided_at: existing.payload.decided_at ?? (newStatus === 'awaiting_disposition' ? null : nowIso),
    answer_payload: answerPayload !== undefined ? answerPayload : existing.payload.answer_payload,
    authority: authority !== undefined ? authority : existing.payload.authority,
  };

  const { data, error } = await supabase
    .from('system_events')
    .update({ payload: nextPayload })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    throw new Error(`updateDispositionStatus: update failed: ${error.message}`);
  }
  return data;
}

/**
 * List all disposition rows in status=awaiting_disposition for a given
 * decision_type, sorted oldest-first. Returns raw data only -- no
 * rendering/formatting logic lives here; each consumer owns its own
 * presentation.
 *
 * @param {object} supabase
 * @param {'ratification'|'consult_answer'|'dispatch_auth'} decisionType
 * @returns {Promise<object[]>}
 */
export async function listAwaitingDisposition(supabase, decisionType) {
  assertSupabase(supabase);
  if (!VALID_DECISION_TYPES.includes(decisionType)) {
    return [];
  }
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('system_events')
      .select('*')
      .eq('event_type', EVENT_TYPE)
      .eq('payload->>decision_type', decisionType)
      .eq('payload->>status', 'awaiting_disposition')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })); // id tiebreaker: stable page boundaries (FR-6)
  } catch (error) {
    throw new Error(`listAwaitingDisposition: query failed: ${error.message}`);
  }
  return data ?? [];
}
