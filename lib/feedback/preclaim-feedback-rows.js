/**
 * SD-FDBK-INFRA-PER-FEEDBACK-ROW-001 / FR-2
 *
 * Atomic conditional pre-claim of feedback rows at QF creation time.
 * Closes the sibling-QF collision window (RCA 2026-05-11, feedback 9a9292c8).
 *
 * Pattern mirrors scripts/create-quick-fix.js:285-305 existing atomic claim on
 * quick_fixes.claiming_session_id: native-PG UPDATE...WHERE col IS NULL
 * RETURNING id eliminates the SELECT-then-UPDATE TOCTOU window.
 *
 * @canonical-writer-for: feedback (pre-claim path; complements emit-feedback.js insert path)
 */

/**
 * Resolve a feedback identifier (full UUID, short prefix, or comma-separated list)
 * to canonical UUIDs.
 *
 * @param {object} supabase - Supabase client
 * @param {string} raw - --feedback-id arg value
 * @returns {Promise<string[]>} array of full UUIDs
 * @throws {Error} with code FEEDBACK_ID_NOT_FOUND or FEEDBACK_ID_AMBIGUOUS
 */
export async function resolveFeedbackIds(supabase, raw) {
  const tokens = String(raw || '').split(',').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) {
    const e = new Error('--feedback-id: no values supplied');
    e.code = 'FEEDBACK_ID_EMPTY';
    throw e;
  }
  const resolved = [];
  for (const t of tokens) {
    const isFullUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t);
    if (isFullUuid) { resolved.push(t.toLowerCase()); continue; }
    if (!/^[0-9a-f]{4,35}$/i.test(t)) {
      const e = new Error(`--feedback-id: invalid token "${t}" (expected UUID or short prefix)`);
      e.code = 'FEEDBACK_ID_INVALID';
      throw e;
    }
    // SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 FR-3: feedback.id is uuid, so
    // .ilike('id', '<prefix>%') throws "operator does not exist: uuid ~~* unknown".
    // Resolve short prefixes via an id::text cast through exec_sql (mirrors
    // scripts/leo-create-sd.js:398-399). `t` is already validated hex-only
    // (/^[0-9a-f]{4,35}$/i above), so the interpolation is injection-safe.
    const { data: rpcData, error } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM feedback WHERE id::text LIKE '${t}%' LIMIT 2` });
    if (error) throw error;
    const rows = rpcData?.[0]?.result || [];
    if (rows.length === 0) {
      const e = new Error(`--feedback-id: no feedback row matches prefix "${t}"`);
      e.code = 'FEEDBACK_ID_NOT_FOUND';
      throw e;
    }
    if (rows.length > 1) {
      const e = new Error(`--feedback-id: prefix "${t}" matches multiple rows (use full UUID)`);
      e.code = 'FEEDBACK_ID_AMBIGUOUS';
      throw e;
    }
    resolved.push(rows[0].id);
  }
  return resolved;
}

/**
 * Atomic conditional pre-claim of feedback rows. Returns { claimed, conflicts }.
 *
 * SQL: UPDATE feedback SET quick_fix_id=$pendingQfId, session_id=$sessionId,
 *      metadata = jsonb_set(jsonb_set(coalesce(metadata,'{}'::jsonb),
 *                                     '{qf_claim_state}', '"pending"'),
 *                           '{qf_claim_at}', to_jsonb(now()))
 *      WHERE id = ANY($feedbackIds) AND quick_fix_id IS NULL
 *      RETURNING id;
 *
 * Conflicts are derived by re-SELECTing the non-claimed remainder enriched
 * with the current claimer's session heartbeat.
 *
 * @param {object} opts
 * @param {object} opts.supabase - Supabase client
 * @param {string[]} opts.feedbackIds - feedback UUIDs to claim
 * @param {string} opts.pendingQfId - the not-yet-INSERTed QF id (text)
 * @param {string} opts.sessionId - CLAUDE_SESSION_ID of caller
 * @returns {Promise<{claimed: {id:string}[], conflicts: {id, qf_id, session_id, heartbeat_at}[]}>}
 */
export async function preclaimFeedbackRows({ supabase, feedbackIds, pendingQfId, sessionId }) {
  if (!Array.isArray(feedbackIds) || feedbackIds.length === 0) {
    return { claimed: [], conflicts: [] };
  }
  // Atomic conditional UPDATE via PostgREST .update().is(...).in(...). Returning
  // shape: rows that satisfied the predicate. PostgREST does not natively
  // express jsonb_set in a single UPDATE call without RPC; we emulate by
  // reading-current-metadata + writing-merged-metadata, but we PROTECT against
  // races by gating on quick_fix_id IS NULL (which is the atomic check). The
  // jsonb merge is best-effort cosmetic state — the canonical "claimed" signal
  // is quick_fix_id != NULL with our pendingQfId.
  const claimedAt = new Date().toISOString();
  // Step 1: read current metadata for the target rows (only NULL-quick_fix_id eligible).
  const { data: targets, error: readErr } = await supabase
    .from('feedback')
    .select('id, metadata')
    .in('id', feedbackIds)
    .is('quick_fix_id', null);
  if (readErr) throw readErr;
  const eligibleIds = (targets || []).map(r => r.id);
  const claimed = [];
  // Step 2: per-row UPDATE with quick_fix_id IS NULL race-guard.
  // The race-guard is the atomic part; metadata merge is per-row.
  for (const row of targets || []) {
    const newMeta = { ...(row.metadata || {}), qf_claim_state: 'pending', qf_claim_at: claimedAt };
    const { data: updRows, error: updErr } = await supabase
      .from('feedback')
      .update({ quick_fix_id: pendingQfId, session_id: sessionId, metadata: newMeta })
      .eq('id', row.id)
      .is('quick_fix_id', null)
      .select('id');
    if (updErr) throw updErr;
    if (updRows && updRows.length === 1) claimed.push({ id: row.id });
  }
  // Step 3: any requested id not in claimed[] is a conflict — enrich with current claimer.
  const claimedSet = new Set(claimed.map(c => c.id));
  const conflictIds = feedbackIds.filter(id => !claimedSet.has(id));
  const conflicts = [];
  if (conflictIds.length > 0) {
    const { data: conflictRows, error: cErr } = await supabase
      .from('feedback')
      .select('id, quick_fix_id, session_id, metadata')
      .in('id', conflictIds);
    if (cErr) throw cErr;
    const sessIds = (conflictRows || []).map(r => r.session_id).filter(Boolean);
    let heartbeats = {};
    if (sessIds.length > 0) {
      const { data: hb } = await supabase
        .from('claude_sessions')
        .select('session_id, heartbeat_at')
        .in('session_id', sessIds);
      heartbeats = Object.fromEntries((hb || []).map(h => [h.session_id, h.heartbeat_at]));
    }
    for (const r of conflictRows || []) {
      conflicts.push({
        id: r.id,
        qf_id: r.quick_fix_id || null,
        session_id: r.session_id || null,
        heartbeat_at: r.session_id ? heartbeats[r.session_id] || null : null,
      });
    }
  }
  return { claimed, conflicts };
}

/**
 * SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 / FR-1
 *
 * Extract distinct full feedback UUIDs referenced in free text (QF title /
 * description / steps). Used to detect sibling-QF collisions when --feedback-id
 * was omitted but the operator pasted the feedback UUID into the text (the
 * QF-723/729/006 class). Capped to avoid unbounded scanning of pasted logs.
 *
 * @param {string} text
 * @param {number} cap - max distinct UUIDs to return (default 5)
 * @returns {string[]} lowercased distinct UUIDs, in first-seen order
 */
export function extractFeedbackUuids(text, cap = 5) {
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const found = String(text || '').match(re) || [];
  const seen = [];
  for (const u of found) {
    const lc = u.toLowerCase();
    if (!seen.includes(lc)) seen.push(lc);
    if (seen.length >= cap) break;
  }
  return seen;
}

/**
 * SD-FDBK-INFRA-MAKE-FEEDBACK-BASED-001 / FR-1
 *
 * Given free text, find feedback rows it references (by full UUID) that are
 * ALREADY claimed by an open/in_progress Quick-Fix — i.e. a silent sibling
 * spawn. Mirrors the --feedback-id HARD gate's open-rival check, but keyed off
 * the text reference rather than the CLI flag.
 *
 * FAIL-OPEN: any DB read error returns { conflicts: [], failedOpen: true } so a
 * transient DB issue can NEVER brick QF creation on the shared hot path (G4).
 * Resolution uses EXACT .eq('id', uuid) (uuid column) — never .ilike (which
 * throws on uuid), so this is unaffected by the FR-3 prefix-cast concern.
 *
 * @param {object} opts
 * @param {object} opts.supabase
 * @param {string} opts.text - combined QF title/description/steps
 * @param {string[]} opts.statuses - rival QF statuses that count as a conflict
 * @returns {Promise<{uuids:string[], conflicts:{id,status,title}[], failedOpen:boolean, error?:string}>}
 */
export async function findFeedbackRefConflicts({ supabase, text, statuses = ['open', 'in_progress'] }) {
  const uuids = extractFeedbackUuids(text);
  if (uuids.length === 0) return { uuids, conflicts: [], failedOpen: false };
  try {
    const { data: linkedFb, error: e1 } = await supabase
      .from('feedback')
      .select('id, quick_fix_id')
      .in('id', uuids)
      .not('quick_fix_id', 'is', null);
    if (e1) throw e1;
    const linkedQfIds = [...new Set((linkedFb || []).map(r => r.quick_fix_id))];
    if (linkedQfIds.length === 0) return { uuids, conflicts: [], failedOpen: false };
    const { data: openRivals, error: e2 } = await supabase
      .from('quick_fixes')
      .select('id, status, title')
      .in('id', linkedQfIds)
      .in('status', statuses);
    if (e2) throw e2;
    return { uuids, conflicts: openRivals || [], failedOpen: false };
  } catch (err) {
    return { uuids, conflicts: [], failedOpen: true, error: err?.message || String(err) };
  }
}
