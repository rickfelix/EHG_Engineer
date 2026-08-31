/**
 * Off-canonical-path mint gauge — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-2/FR-3).
 *
 * QUICK FIXES ONLY (TESTING finding T-3, corrected from the original QF+SD scope):
 * strategic_directives_v2 carries NO routing_tier column, and 0/5954 SDs carry it in metadata
 * either — the only routing_tier writers are QF-creation callers (create-quick-fix.js,
 * convergence-remediation-writers.js) that persist scripts/modules/triage-gate.js's decision.
 * A QF that reaches the OPEN, claimable lane with routing_tier NULL therefore bypassed the
 * canonical triage-gate.js -> work-item-router.js risk classification entirely — exactly the
 * defect class behind live incident QF-20260830-901, which this gauge exists to catch mechanically
 * rather than relying on review to notice a bypass.
 *
 * FR-3: this module reuses work-item-router.js's RISK_KEYWORDS/checkRiskEscalation as its ONLY
 * risk signal (no new keyword list) — but only as an ADVISORY severity hint on an already-flagged
 * row (routing_tier IS NULL); it never re-derives the tier decision itself.
 */
import { RISK_KEYWORDS, SCHEMA_KEYWORDS } from '../utils/work-item-router.js';

/** QF ids reserved for fixtures/tests that should never trip this gauge. */
const FIXTURE_QF_ID_RE = /^QF-(TEST|FIXTURE)-/i;

export function isFixtureQf(qf) {
  return Boolean(qf && typeof qf.id === 'string' && FIXTURE_QF_ID_RE.test(qf.id));
}

function textOf(qf) {
  return `${qf?.title || ''} ${qf?.description || ''}`.toLowerCase();
}

/** Advisory-only: does the flagged row's text ALSO carry a risk/schema signal (FR-3 reuse)? */
export function hasRiskSignal(qf) {
  const text = textOf(qf);
  return RISK_KEYWORDS.some((kw) => text.includes(kw)) || SCHEMA_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Pure detection over already-fetched open QF rows.
 * @param {Array<{id:string, title?:string, description?:string, status?:string, routing_tier?:number|null}>} qfs
 * @returns {{count:number, flagged:Array<{id:string, riskSignal:boolean}>}}
 */
export function detectOffCanonicalMints(qfs) {
  const flagged = [];
  for (const qf of qfs || []) {
    if (!qf || qf.status !== 'open') continue;
    if (qf.routing_tier !== null && qf.routing_tier !== undefined) continue;
    if (isFixtureQf(qf)) continue;
    flagged.push({ id: qf.id, riskSignal: hasRiskSignal(qf) });
  }
  return { count: flagged.length, flagged };
}

/**
 * DB-fetching wrapper. gauge-runner.mjs resolver calls this and reports the count via the shared
 * `hold-state-overdue`-style GAUGE line convention.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function scanOpenQfsForOffCanonicalMints(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .select('id, title, description, status, routing_tier')
    .eq('status', 'open');
  if (error) throw new Error(`scanOpenQfsForOffCanonicalMints: ${error.message}`);
  return detectOffCanonicalMints(data || []);
}

export default { isFixtureQf, hasRiskSignal, detectOffCanonicalMints, scanOpenQfsForOffCanonicalMints };
