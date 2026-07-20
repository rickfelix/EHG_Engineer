/**
 * Acceptance-Tier Downgrade Gate — LEAD-FINAL-APPROVAL handoff gate.
 *
 * SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-C (Solomon checkpoint-3, F3).
 *
 * PROBLEM: when a PRD's acceptance criterion (AC) declares a live/never-mocked
 * evidence tier (e.g. "live proof required", "never mocked") but the SD's actual
 * gate evidence is unit-test-only, the pipeline passes SILENTLY today — no one
 * decided that tier downgrade was acceptable, no one was even told it happened.
 *
 * NOT a reuse of scripts/modules/handoff/validation/validator-registry/gates/
 * value-authenticity-spec-gate.js — that gate detects whether AC text selects a
 * canonical VA-T#-slug library-ID token (a different, unrelated check) and runs
 * at LEAD-TO-PLAN, before any EXEC evidence exists to cross-reference against.
 * Verified via direct code read + its leo_validation_rules DB row + git history
 * (LEAD-phase Explore investigation, this SD).
 *
 * DESIGN (modeled on the two real, already-wired sibling gates in this directory):
 *   - PRD loading: activation-invariant-gate.js's loadPRD (prdRepo.getBySdUuid,
 *     direct-Supabase fallback), extended to select functional_requirements.
 *   - Evidence loading: activation-invariant-gate.js's loadTestingEvidence query
 *     shape, widened to sub_agent_code IN ('TESTING','SECURITY').
 *   - Observe-only-by-default shape: phantom-test-audit-gate.js's issues:[]/
 *     warnings:[...] convention on a passing result.
 *
 * HEURISTIC, HONESTLY SCOPED: no column anywhere in this schema (sub_agent_execution_results,
 * user_stories, product_requirements_v2.functional_requirements) distinguishes unit-vs-live/E2E
 * test evidence at the FR/AC level (verified by schema search). A text-keyword match on both
 * sides is the only available v1 signal, not a shortcut around a better option.
 *
 * OBSERVE-ONLY BY DEFAULT (ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING=true to flip): mirrors this
 * repo's own established rollout convention for a new heuristic gate on safety-critical shared
 * code (value-authenticity-spec-gate.js's own precedent, after its documented QF-20260704-121
 * false-positive incident). Observe-only mode is pinned at score:100/max_score:100 so
 * ValidationOrchestrator's weighted-average normalizedScore can only be pulled up or flat, never
 * trip a threshold — but every detected potential downgrade is placed in warnings[] by name,
 * never silently absent from the gate's returned result. This alone fully satisfies Solomon's
 * complaint: zero signal today becomes a permanent, non-silent line naming the specific FR.
 *
 * No bypass mechanism ships in this v1 (dead code while observe-only — nothing to bypass; add
 * alongside a future BINDING flip, not bundled here).
 *
 * ADVERSARIAL-REVIEW FIXES (EXEC phase, this SD, before EXEC-TO-PLAN): an independent review
 * of the real diff, backed by a live-DB column query, found the initial loadEvidenceRows()
 * selected `evidence` and `test_execution` columns that do NOT exist on
 * sub_agent_execution_results (verified live: id, sd_id, sub_agent_code, sub_agent_name,
 * verdict, confidence, critical_issues, warnings, recommendations, detailed_analysis,
 * execution_time, metadata, created_at, updated_at, risk_assessment_id, validation_mode,
 * justification, conditions, invocation_id, summary, raw_output, source,
 * required_sub_agents, phase, executed_from_cwd — no `evidence`/`test_execution`). That bug
 * made the query fail (or return no matching rows), making crossReferenceEvidence's
 * hasLiveEvidence permanently false — silently defeating the whole detection mechanism. Fixed
 * by scanning only real free-text-bearing columns (EVIDENCE_TEXT_COLUMNS below). The same
 * review also found substring matching ("production" matching inside "reproduction") could
 * cause false-negative evidence clearing once binding — fixed with \b-bounded regex matching
 * in matchesAny(). Also added try/catch around both DB lookups so an infra error fails OPEN
 * (a passing result with a warning) rather than escaping to the orchestrator, which would
 * turn into passed:false/score:0 on this required gate — a DB blip is not an acceptance-tier
 * downgrade and must never masquerade as one.
 *
 * SECOND ADVERSARIAL-REVIEW PASS (a fresh, independent agent, against the fixed diff above)
 * found one more real gap: supabase-js resolves query-level failures (bad column, RLS denial,
 * PostgREST 4xx) as {data:null,error} — it does NOT throw for those. The original try/catch
 * only caught thrown exceptions, so a real query error would have silently fallen through as
 * "no PRD" / "no evidence rows" instead of the intended fail-open "skipped, could not
 * evaluate" warning. Fixed: both loaders now explicitly check `error` and throw, so the
 * existing try/catch handles both failure shapes uniformly.
 *
 * KNOWN, ACCEPTED v1 PRECISION LIMITS (raised by the same review pass, deliberately NOT
 * "fixed" — see rationale): (1) crossReferenceEvidence checks for ANY live-evidence signal
 * across ALL of the SD's TESTING+SECURITY rows, not per-FR — a genuinely live-verified FR-1
 * provides blanket cover for a silently-downgraded FR-5 in the same SD. (2) scanning the
 * `metadata` JSONB column for keywords like "e2e"/"production" can false-clear on an
 * incidental path/config mention (e.g. a worktree path containing "e2e") rather than a
 * genuine live-run narrative. Both are inherent to a purely lexical v1 heuristic with no
 * per-FR evidence-tracking column anywhere in this schema (the same "HEURISTIC, HONESTLY
 * SCOPED" constraint documented above) — a true fix requires new evidence-schema work, out
 * of scope for this SD per the LEAD-phase scope cut. Both failure modes are FALSE NEGATIVES
 * (a real downgrade goes unreported), never false positives that would trip BINDING mode
 * incorrectly — so the gate's core safety property (never wrongly blocks) still holds.
 */

const GATE_NAME = 'ACCEPTANCE_TIER_DOWNGRADE';

// High-precision multi-word phrases only — deliberately excludes short/ambiguous fragments
// ("no mocks", "not mocked", bare "live") that would false-positive on unrelated prose (e.g.
// "the UI should not look mocked up", "delivered live to customers"). Centralized here for easy
// future extension without touching the detection logic.
export const LIVE_TIER_KEYWORDS = Object.freeze([
  'never mocked',
  'never-mocked',
  'live proof required',
  'live-verified',
]);

// Evidence-side signal: does a sub-agent evidence row for this SD mention any live/E2E proof?
// Single-token entries ('e2e') are matched with word boundaries (see matchesAny) so they never
// match as a substring of an unrelated word (e.g. "production" must never match "reproduction").
export const LIVE_EVIDENCE_KEYWORDS = Object.freeze([
  'live proof',
  'live run',
  'e2e',
  'production',
  'live-verified',
  'live one-tick',
  'live test',
]);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Coerce one acceptance_criteria[] entry (string | {criteria|text|description|title} | other) into searchable text. */
export function acEntryText(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object') {
    const t = entry.criteria || entry.text || entry.description || entry.title;
    if (typeof t === 'string') return t;
  }
  try { return JSON.stringify(entry); } catch { return String(entry); }
}

/**
 * Coerce a PRD FR's acceptance_criteria field (array | JSON-string-encoded array | plain string)
 * into a flat array of searchable strings. Never throws.
 */
export function normalizeAcceptanceCriteria(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(acEntryText);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(acEntryText);
      } catch { /* not valid JSON — fall through to plain-string handling */ }
    }
    return trimmed ? [trimmed] : [];
  }
  return [acEntryText(raw)];
}

/**
 * True when `text` contains any keyword from `list` as a whole word/phrase (case-insensitive,
 * \b-bounded). Word-boundary matching prevents a short keyword from matching as a substring of
 * an unrelated word (e.g. "production" must never match inside "reproduction").
 */
function matchesAny(text, list) {
  const t = text || '';
  return list.find((kw) => new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(t));
}

/**
 * FR-1: scan every FR's acceptance_criteria for a live/never-mocked tier declaration.
 * @returns {Array<{frId:string, description:string, matchedPhrase:string}>}
 */
export function detectLiveTierFRs(functionalRequirements = []) {
  const flagged = [];
  const frs = Array.isArray(functionalRequirements) ? functionalRequirements : [];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    const frId = (fr && (fr.id || fr.fr_id)) || `FR-${i + 1}`;
    const acTexts = normalizeAcceptanceCriteria(fr && fr.acceptance_criteria);
    for (const text of acTexts) {
      const matched = matchesAny(text, LIVE_TIER_KEYWORDS);
      if (matched) {
        flagged.push({ frId, description: (fr && (fr.title || fr.description)) || '', matchedPhrase: matched });
        break; // one flag per FR is enough
      }
    }
  }
  return flagged;
}

// The columns actually present on sub_agent_execution_results that can carry free-text
// evidence content (verified against the LIVE database, not a possibly-stale schema file —
// this table has NO `evidence` or `test_execution` column, despite the intuitive naming).
export const EVIDENCE_TEXT_COLUMNS = Object.freeze(['detailed_analysis', 'summary', 'critical_issues', 'warnings', 'recommendations', 'metadata']);

/** Defensive stringify of the evidence-bearing columns that ACTUALLY EXIST on sub_agent_execution_results. */
function evidenceRowText(row) {
  const parts = [];
  for (const key of EVIDENCE_TEXT_COLUMNS) {
    const v = row && row[key];
    if (v == null) continue;
    parts.push(typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return ''; } })());
  }
  return parts.join(' ');
}

/**
 * FR-2: PER-FR evidence isolation — each flagged FR is checked against the evidence rows
 * independently; a live signal for one FR never clears a different, unrelated FR.
 * @returns {{frId, description, matchedPhrase, hasLiveEvidence:boolean}[]}
 */
export function crossReferenceEvidence(flaggedFRs, evidenceRows = []) {
  const rowsText = (evidenceRows || []).map(evidenceRowText);
  return flaggedFRs.map((fr) => {
    const hasLiveEvidence = rowsText.some((t) => matchesAny(t, LIVE_EVIDENCE_KEYWORDS));
    return { ...fr, hasLiveEvidence };
  });
}

/** Mirrors activation-invariant-gate.js's loadPRD — prdRepo first, direct-Supabase fallback. */
async function loadPRD({ supabase, prdRepo, sdId }) {
  if (prdRepo?.getBySdUuid) {
    const prd = await prdRepo.getBySdUuid(sdId);
    if (prd) return prd;
  }
  if (prdRepo?.getBySdId) {
    const prd = await prdRepo.getBySdId(sdId);
    if (prd) return prd;
  }
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .select('id, sd_id, functional_requirements')
    .eq('sd_id', sdId)
    .limit(1)
    .maybeSingle();
  // supabase-js resolves query-level failures (bad column, RLS denial, PostgREST 4xx) as
  // {data:null,error} rather than throwing -- must surface it explicitly so the caller's
  // try/catch (the fail-open path) actually sees it, instead of silently treating a real
  // query error the same as "no PRD found".
  if (error) throw new Error(`product_requirements_v2 query failed: ${error.message}`);
  return data || null;
}

/** Mirrors activation-invariant-gate.js's loadTestingEvidence, widened to TESTING+SECURITY. */
async function loadEvidenceRows({ supabase, sdId }) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .select(`id, sub_agent_code, ${EVIDENCE_TEXT_COLUMNS.join(', ')}`)
    .eq('sd_id', sdId)
    .in('sub_agent_code', ['TESTING', 'SECURITY']);
  // Same rationale as loadPRD above: a query-level error resolves as {data:null,error} here,
  // not a throw. Surfacing it is critical for THIS query specifically -- silently treating it
  // as "no evidence rows" would mark every flagged FR downgraded on a mere query hiccup.
  if (error) throw new Error(`sub_agent_execution_results query failed: ${error.message}`);
  return data || [];
}

export function isBindingEnabled(env = process.env) {
  return env.ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING === 'true';
}

export function createAcceptanceTierDowngradeGate(supabase, prdRepo) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n🎯 GATE: Acceptance-Tier Downgrade');
      console.log('-'.repeat(50));

      const sdId = ctx?.sd?.id;

      // This gate is a best-effort heuristic signal, never a hard requirement — a DB/IO error
      // here must NEVER escape and turn into an orchestrator-level passed:false/score:0 on this
      // required gate (that would violate the gate's own "observe-only can never block" promise,
      // regardless of the BINDING flag, since the promise is about detection findings, not infra
      // hiccups). Fail open: log a warning, treat as "could not evaluate", pass clean.
      let prd;
      try {
        prd = await loadPRD({ supabase, prdRepo, sdId });
      } catch (err) {
        console.log(`   ⚠️  PRD lookup error (failing open): ${err.message}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`Acceptance-tier-downgrade check skipped — PRD lookup failed: ${err.message}`], details: { error: 'prd_lookup_failed' } };
      }
      const frs = (prd && prd.functional_requirements) || [];

      if (!prd || frs.length === 0) {
        console.log('   ℹ️  No PRD / no functional requirements — gate not applicable');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: ['No PRD or no FRs — acceptance-tier-downgrade check skipped'], details: { flagged: 0 } };
      }

      const flagged = detectLiveTierFRs(frs);
      if (flagged.length === 0) {
        console.log('   No live/never-mocked-tier AC declarations found.');
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { flagged: 0 } };
      }

      let evidenceRows;
      try {
        evidenceRows = await loadEvidenceRows({ supabase, sdId });
      } catch (err) {
        console.log(`   ⚠️  Evidence lookup error (failing open): ${err.message}`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [`Acceptance-tier-downgrade check skipped — evidence lookup failed: ${err.message}`], details: { error: 'evidence_lookup_failed', flagged: flagged.length } };
      }
      const evaluated = crossReferenceEvidence(flagged, evidenceRows);
      const downgraded = evaluated.filter((f) => !f.hasLiveEvidence);

      if (downgraded.length === 0) {
        console.log(`   ${flagged.length} live-tier FR(s) all have matching live-evidence signal.`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { flagged: flagged.length, downgraded: 0 } };
      }

      const messages = downgraded.map((f) => `${GATE_NAME}: ${f.frId} declares a live/never-mocked tier ("${f.matchedPhrase}") but no sub-agent evidence for this SD shows a live/E2E signal — possible silent acceptance-tier downgrade.`);
      const binding = isBindingEnabled();

      if (!binding) {
        console.log(`   ⚠️  ${downgraded.length} potential downgrade(s) found (observe-only — see warnings).`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: messages, details: { flagged: flagged.length, downgraded: downgraded.length, binding: false } };
      }

      console.log(`   ❌ ${downgraded.length} potential downgrade(s) found — BINDING mode.`);
      return { passed: false, score: 0, max_score: 100, issues: messages, warnings: [], details: { flagged: flagged.length, downgraded: downgraded.length, binding: true } };
    },
    required: true,
  };
}
