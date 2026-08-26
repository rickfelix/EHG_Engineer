/**
 * Retrospective-gate query filters (SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001)
 *
 * Both PLAN-TO-LEAD (retrospective-quality.js) and LEAD-FINAL-APPROVAL
 * (createRetrospectiveExistsGate) must enforce the same invariants:
 *   1. Existence: at least one retrospective row for the SD
 *   2. Type: retro_type = 'SD_COMPLETION' (excludes SPRINT/INCIDENT/AUDIT/HANDOFF)
 *   3. Not a handoff-time retro: retrospective_type IS NULL (defense in depth)
 *   4. Freshness: created_at > the SD's LEAD-TO-PLAN acceptance timestamp
 *      (defense in depth)
 *
 * SD-LEO-INFRA-NORMALIZE-HANDOFF-RETROSPECTIVE-001: handoff-time retrospectives
 * are now written with retro_type='HANDOFF' (the 3 handoff retro writers), so the
 * retro_type='SD_COMPLETION' filter (#2) excludes them on its own — that is the
 * primary mechanism. The retrospective_type (#3) and timestamp (#4) filters are
 * retained as defense-in-depth: they still exclude any legacy rows from before the
 * backfill that a manual writer might leave tagged with a handoff phase under
 * retro_type='SD_COMPLETION'. (Previously handoff retros shared
 * retro_type='SD_COMPLETION', so retro_type alone could NOT distinguish them and
 * #3/#4 were load-bearing — see git history pre-NORMALIZE-HANDOFF.)
 */

/**
 * SD-LEO-FIX-RETROSPECTIVE-EXISTS-GATE-001: sd_phase_handoffs.accepted_at is a
 * `timestamp without time zone` column in some environments — PostgREST returns it
 * as a naive string (no Z / offset suffix). Passed as-is into the `.gt('created_at',
 * ...)` filter below, PostgREST/Postgres casts that naive literal to timestamptz
 * using the DB SESSION's TimeZone setting (not necessarily UTC), shifting the actual
 * freshness boundary by the session-timezone offset (e.g. ET vs UTC) versus
 * `retrospectives.created_at`, which is stored as an absolute UTC instant. A
 * genuinely-fresh SD-completion retrospective created shortly after LEAD-TO-PLAN can
 * then read as older than the (wrongly-shifted) boundary — false "no retrospective
 * found". Same bug class already fixed in
 * scripts/modules/handoff/gates/subagent-evidence-gate.js and lib/handoff/wait-verdict.js;
 * this is the third, previously-unpatched call site sharing the same
 * sd_phase_handoffs.accepted_at column. Mirrors those fixes exactly — normalize to an
 * explicit-UTC ISO string before it is used in any date comparison.
 *
 * @param {string|Date|null} ts
 * @returns {Date|null}
 */
export function parseAsUTC(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
  return new Date(hasTZ ? ts : `${ts}Z`);
}

/**
 * QF-20260704-127: ctx.sd.id has been observed carrying the SD's legacy uuid_id
 * column instead of its canonical id (same corruption class as QF-20260703-906,
 * which patched PREREQUISITE_HANDOFF_CHECK inline) — for child SDs specifically,
 * making every .eq(sdUuid) below come back clean-empty (valid UUID, zero matches)
 * rather than erroring, so a real retrospective silently reads as missing.
 * Re-resolve via sd_key (unaffected by the id/uuid_id ambiguity) whenever available.
 *
 * @param {string} sdUuid - candidate strategic_directives_v2.id (UUID)
 * @param {string|null} sdKey - SD's sd_key, used to re-resolve the canonical id
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} the canonical id (or the original sdUuid if unresolvable)
 */
async function resolveCanonicalSdId(sdUuid, sdKey, supabase) {
  if (!sdKey) return sdUuid;
  const { data: canonical } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', sdKey)
    .maybeSingle();
  if (canonical?.id && canonical.id !== sdUuid) {
    console.log(`   ⚠️  [retro-filters] sdUuid mismatch (${sdUuid} vs canonical ${canonical.id}) — using canonical id`);
    return canonical.id;
  }
  return sdUuid;
}

/**
 * Resolve the LEAD-TO-PLAN acceptance timestamp for an SD.
 * Falls back to sdCreatedAt if no accepted LEAD-TO-PLAN handoff row exists
 * (Phase-0 / unusual SDs — see SD risk analysis, accepted permissive).
 *
 * @param {string} sdUuid - strategic_directives_v2.id (UUID)
 * @param {string|null} sdCreatedAt - SD.created_at ISO string, used as fallback
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} ISO timestamp string
 */
export async function resolveLeadToPlanAcceptedAt(sdUuid, sdCreatedAt, supabase) {
  const { data: handoff } = await supabase
    .from('sd_phase_handoffs')
    .select('accepted_at')
    .eq('sd_id', sdUuid)
    .eq('from_phase', 'LEAD')
    .eq('to_phase', 'PLAN')
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Normalize to an explicit-UTC ISO string (parseAsUTC above) — the raw column value
  // may be a naive (no-Z) timestamp string; used downstream both as the .gt() filter
  // value and in the gate's human-facing error message, so both must be unambiguous.
  if (handoff?.accepted_at) return parseAsUTC(handoff.accepted_at).toISOString();
  if (sdCreatedAt) return parseAsUTC(sdCreatedAt).toISOString();
  return new Date(0).toISOString();
}

/**
 * Fetch the most recent SD-completion retrospective that satisfies the three
 * invariants (existence, type, freshness). Returns null when no row matches.
 *
 * @param {string} sdUuid - candidate strategic_directives_v2.id (UUID)
 * @param {string|null} sdCreatedAt - SD.created_at ISO string, freshness fallback
 * @param {Object} supabase - Supabase client
 * @param {string|null} [sdKey] - SD's sd_key, used to re-resolve the canonical id (QF-20260704-127)
 * @returns {Promise<{retrospective: Object|null, leadToPlanAcceptedAt: string, error: Object|null}>}
 */
export async function getFilteredRetrospective(sdUuid, sdCreatedAt, supabase, sdKey = null) {
  const canonicalId = await resolveCanonicalSdId(sdUuid, sdKey, supabase);
  const leadToPlanAcceptedAt = await resolveLeadToPlanAcceptedAt(canonicalId, sdCreatedAt, supabase);

  const { data: retrospective, error } = await supabase
    .from('retrospectives')
    .select('*')
    .eq('sd_id', canonicalId)
    .eq('retro_type', 'SD_COMPLETION')
    // QF-20260530-670: accept retrospective_type IS NULL (canonical generate-retrospective.js)
    // OR ='SD_COMPLETION' (retro-agent's ad-hoc inserts mistag it). Handoff-time retros tag this
    // column with the PHASE (LEAD_TO_PLAN/PLAN_TO_EXEC/EXEC_TO_PLAN), never 'SD_COMPLETION', so
    // they remain correctly excluded — this only admits genuine SD-completion retros.
    .or('retrospective_type.is.null,retrospective_type.eq.SD_COMPLETION')
    // A legitimate in-place UPDATE to an existing retro (e.g. enhanceRetrospective())
    // bumps the trigger-maintained updated_at column but never created_at -- a
    // created_at-only freshness check made such a retro invisible to this gate even
    // though it now genuinely satisfies quality/freshness (feedback
    // 005182bf-33c7-4583-ad37-73f735a0a326). Accept either timestamp past the cutoff.
    .or(`created_at.gt.${leadToPlanAcceptedAt},updated_at.gt.${leadToPlanAcceptedAt}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { retrospective: retrospective || null, leadToPlanAcceptedAt, error: error || null };
}

/**
 * SD-LEO-INFRA-PLAN-LEAD-RETRO-001 FR-3: single shared error-normalization contract for
 * BOTH preflight call sites (PLAN-TO-LEAD setup(), LEAD-FINAL-APPROVAL's
 * runProgrammaticRetrospective()) — the two generators (RETRO sub-agent, retrospective-
 * generator.js) fail with different shapes (thrown Error vs spawnSync stderr/exit code),
 * so callers pass whatever raw value they have and this collapses it to one line,
 * truncated to 200 chars (matches the existing stderr.substring(0,200) convention already
 * used in lead-final-approval/index.js) so the appended gate text is consistent and
 * test-assertable.
 *
 * @param {Error|string|null|undefined} rawError
 * @returns {string}
 */
export function normalizePreflightRetroError(rawError) {
  const raw = rawError instanceof Error ? rawError.message : String(rawError ?? '');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * SD-LEO-INFRA-PLAN-LEAD-RETRO-001 FR-1: validates a same-call ctx._preflightRetro stash
 * against the SAME invariants getFilteredRetrospective enforces (sd_id, retro_type,
 * freshness) before RETROSPECTIVE_QUALITY_GATE trusts it in place of re-querying. An
 * object with a truthy id but a mismatched sd_id/retro_type, or a created_at at or before
 * leadToPlanAcceptedAt, is NOT trusted — treated identically to "unset" so the gate falls
 * back to its own authoritative query rather than skipping validation on a bad stash.
 *
 * @param {Object|null|undefined} candidate - ctx._preflightRetro
 * @param {string} sdUuid - the canonical SD id being validated
 * @param {string} leadToPlanAcceptedAt - ISO timestamp, the same freshness cutoff getFilteredRetrospective used
 * @returns {boolean}
 */
export function isValidPreflightRetro(candidate, sdUuid, leadToPlanAcceptedAt) {
  if (!candidate || typeof candidate !== 'object' || !candidate.id) return false;
  if (candidate.sd_id !== sdUuid) return false;
  if (candidate.retro_type !== 'SD_COMPLETION') return false;
  if (candidate.retrospective_type != null && candidate.retrospective_type !== 'SD_COMPLETION') return false;
  const cutoff = parseAsUTC(leadToPlanAcceptedAt);
  if (!cutoff) return false;
  const createdAt = parseAsUTC(candidate.created_at);
  const updatedAt = parseAsUTC(candidate.updated_at);
  // Same invariant as getFilteredRetrospective's freshness check: a legitimate in-place
  // UPDATE (enhanceRetrospective()) bumps updated_at but never created_at, so this stash
  // validator must not reject on created_at alone (SD-LEO-INFRA-COMPLETION-INTEGRITY-
  // REPAIR-001, feedback 005182bf) -- the two checks must stay in lockstep or a stashed
  // candidate could pass/fail differently than a fresh getFilteredRetrospective() query.
  const isFresh = (createdAt && createdAt > cutoff) || (updatedAt && updatedAt > cutoff);
  if (!isFresh) return false;
  return true;
}

/**
 * SD-LEO-INFRA-PLAN-LEAD-RETRO-001: shared preflight orchestration for BOTH call sites
 * (PLAN-TO-LEAD setup(), LEAD-FINAL-APPROVAL) — one control flow, not two forks, per TR-1.
 *
 * 1. LEO_RETRO_PREFLIGHT_GATE_UNCONDITIONAL_REGEN set: full pre-SD behavior restored —
 *    always calls generateFn(), never stashes options._preflightRetro or
 *    options._preflightRetroError (the gate falls back to its own query and its own
 *    unmodified message), matching the RISKS rollback contract exactly.
 * 2. Otherwise: check getFilteredRetrospective first.
 *    - Query itself errors (could-not-check): log and return WITHOUT attempting generation,
 *      so the gate's own (identical) query reports the same error consistently (INV-001).
 *    - A qualifying retrospective already exists: stash it, skip generation entirely (this is
 *      what stops LEAD-FINAL-APPROVAL's old unconditional re-run/re-score).
 *    - Nothing qualifies: call generateFn(), then RE-QUERY via getFilteredRetrospective
 *      (not generateFn's own return value, which differs in shape per site) so the SAME
 *      execute() call's gate evaluates the freshly-generated row (FR-1, no retry). On success,
 *      best-effort stamp the row (FR-2, failure here never blocks the handoff). On failure,
 *      normalize the error (FR-3) and stash it for the gate to surface.
 *
 * @param {Object} args
 * @param {Object} args.supabase
 * @param {string} args.sdUuid - canonical SD id
 * @param {string|null} args.sdCreatedAt
 * @param {string|null} args.sdKey
 * @param {Object} args.options - the handoff options object; mutated in place with
 *   _preflightRetro / _preflightRetroError so BaseExecutor's ctx.options carries them to gates.
 * @param {() => Promise<any>} args.generateFn - site-specific generation call (RETRO sub-agent
 *   invocation or retrospective-generator.js spawnSync) — its return value is intentionally
 *   NOT relied upon; the re-query below is the single source of truth for what it wrote.
 * @param {string} args.label - short prefix for log lines (e.g. 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL')
 */
export async function runPreflightRetroCheck({ supabase, sdUuid, sdCreatedAt, sdKey, options, generateFn, label }) {
  if (process.env.LEO_RETRO_PREFLIGHT_GATE_UNCONDITIONAL_REGEN) {
    try {
      await generateFn();
    } catch (err) {
      console.warn(`   ⚠️  ${label} generation failed (non-blocking, LEO_RETRO_PREFLIGHT_GATE_UNCONDITIONAL_REGEN mode): ${err.message}`);
    }
    return;
  }

  const first = await getFilteredRetrospective(sdUuid, sdCreatedAt, supabase, sdKey);
  if (first.error) {
    console.warn(`   ⚠️  ${label} preflight retro check errored (could-not-check — proceeding to gate's own query): ${first.error.message}`);
    return;
  }
  if (first.retrospective) {
    options._preflightRetro = first.retrospective;
    return;
  }

  console.log(`   🔄 ${label}: no qualifying retrospective found — generating...`);
  try {
    await generateFn();
    const after = await getFilteredRetrospective(sdUuid, sdCreatedAt, supabase, sdKey);
    if (after.error) {
      console.warn(`   ⚠️  ${label} post-generation re-check errored: ${after.error.message}`);
      return;
    }
    if (after.retrospective && isValidPreflightRetro(after.retrospective, sdUuid, after.leadToPlanAcceptedAt)) {
      options._preflightRetro = after.retrospective;
      console.log(`   ✅ ${label}: retrospective generated and re-validated in the same call`);
      try {
        await supabase
          .from('retrospectives')
          .update({
            metadata: {
              ...(after.retrospective.metadata || {}),
              generated_by: 'preflight_autogen',
              preflight_generated_at: new Date().toISOString(),
            },
          })
          .eq('id', after.retrospective.id);
      } catch (stampErr) {
        // FR-2 is best-effort: a stamp-write failure must never block a handoff whose
        // underlying retrospective already qualifies.
        console.warn(`   ⚠️  ${label} preflight-generated stamp write failed (non-blocking): ${stampErr.message}`);
      }
    } else {
      console.warn(`   ⚠️  ${label}: generation ran but no qualifying retrospective was found afterward`);
    }
  } catch (genErr) {
    options._preflightRetroError = normalizePreflightRetroError(genErr);
    console.warn(`   ⚠️  ${label} generation failed (non-blocking): ${options._preflightRetroError}`);
  }
}
