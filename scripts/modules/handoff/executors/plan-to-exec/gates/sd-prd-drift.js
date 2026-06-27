/**
 * SD↔PRD Drift Gate (PLAN→EXEC)
 * Part of SD-LEO-INFRA-SD-PRD-DRIFT-GATE-001
 *
 * Late SD-scope edits (a new FR, or a chairman-gated precondition added AFTER the PRD was
 * written) can be silently dropped because nothing compares the SD's functional requirements
 * against the PRD that EXEC actually implements. This gate detects that drift.
 *
 * FR-1 drift detector: extract SD FRs (metadata.functional_requirements, else FR-N prose) +
 *      PRD functional_requirements; flag any material SD FR absent from the PRD.
 * FR-2 false-positive guard: match by FR IDENTITY (FR-key first, keyword-similarity fallback) —
 *      NOT exact string equality — so a reworded-but-present FR does not false-block.
 * FR-3 actionable output: name exactly which SD FRs are missing + route to a PRD re-sync.
 * FR-4 gov-precondition enforcement: a chairman-gated precondition on the SD
 *      (metadata.chairman_decision_required) must be reflected in the PRD or blessed via an
 *      approved chairman_decision before the handoff passes.
 * FR-5 advisory→enforcing: advisory by default (warn, passed=true — never wedges); flip to
 *      enforcing (block) via SD_PRD_DRIFT_ENFORCING=true.
 */

import { extractKeywords, calculateSimilarity } from '../../../validation/scope-similarity.js';

// FR-2: keyword-similarity threshold for the no-key-match fallback. Jaccard over FR text.
const SIMILARITY_THRESHOLD = 0.18;
// Minimum SD-FR text length to bother similarity-matching (skip empty/degenerate FRs).
const MIN_FR_TEXT = 8;

/** Inline array-normalizer (prd-quality-validation.js's normalizeToArray is not exported). */
function normalizeToArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch { /* not JSON */ }
    return [];
  }
  if (typeof value === 'object') return [value];
  return [];
}

/**
 * Extract the SD's FR list. Prefers structured metadata.functional_requirements; falls back to
 * parsing FR-N keys + the following prose from description + scope.
 * @returns {Array<{id:string, text:string}>}
 */
export function extractSdFrs(sd) {
  if (!sd) return [];
  const structured = normalizeToArray(sd.metadata?.functional_requirements);
  if (structured.length > 0) {
    return structured
      .map((f, i) => ({
        id: String(f.id || f.fr_key || `FR-${i + 1}`).toUpperCase(),
        text: [f.title, f.description].filter(Boolean).join(' ').trim(),
      }))
      .filter((f) => f.id);
  }
  // Prose fallback: split description+scope on FR-N markers, keep the text until the next FR-N.
  const prose = [sd.description, sd.scope].filter(Boolean).join('\n');
  const frs = [];
  const re = /\bFR-(\d+)\b[:.\s-]*/gi;
  let m;
  const marks = [];
  while ((m = re.exec(prose)) !== null) marks.push({ id: `FR-${m[1]}`, start: m.index, textStart: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : prose.length;
    const text = prose.slice(marks[i].textStart, end).trim();
    // dedup repeated FR-N markers (description + scope often duplicate); keep the longest text.
    const existing = frs.find((f) => f.id === marks[i].id.toUpperCase());
    if (existing) { if (text.length > existing.text.length) existing.text = text; }
    else frs.push({ id: marks[i].id.toUpperCase(), text });
  }
  return frs;
}

/** Extract the PRD's FR list as {id, text}. */
export function extractPrdFrs(prd) {
  const arr = normalizeToArray(prd?.functional_requirements);
  return arr.map((f, i) => ({
    id: String(f.id || f.fr_key || `FR-${i + 1}`).toUpperCase(),
    text: [f.title, f.description].filter(Boolean).join(' ').trim(),
  }));
}

/**
 * FR-1 + FR-2: is this SD FR present in the PRD? Identity match — FR-key first, then a keyword
 * similarity fallback over the FR text (so reworded-but-present FRs are recognized).
 */
export function sdFrPresentInPrd(sdFr, prdFrs) {
  if (prdFrs.some((p) => p.id && p.id === sdFr.id)) return true; // key match
  if (!sdFr.text || sdFr.text.length < MIN_FR_TEXT) return true; // too thin to assert drift — don't false-block
  const sdKw = extractKeywords(sdFr.text);
  return prdFrs.some((p) => calculateSimilarity(sdKw, extractKeywords(p.text)) >= SIMILARITY_THRESHOLD);
}

/** FR-3: the SD FRs absent from the PRD (by identity). */
export function findDriftedFrs(sdFrs, prdFrs) {
  return sdFrs.filter((f) => !sdFrPresentInPrd(f, prdFrs));
}

/**
 * FR-4: is a chairman-gated precondition recorded on the SD, and is it reflected in the
 * PRD/EXEC contract (or blessed via an approved chairman_decision)?
 * @returns {Promise<{required:boolean, satisfied:boolean, marker:string|null}>}
 */
export async function checkGovPrecondition(sd, prd, supabase) {
  const marker = sd?.metadata?.chairman_decision_required;
  if (!marker) return { required: false, satisfied: true, marker: null };
  // (a) reflected in the PRD: any FR/AC/technical_requirement text references a chairman bless/decision precondition.
  const haystack = JSON.stringify({
    fr: prd?.functional_requirements, ac: prd?.acceptance_criteria, tr: prd?.technical_requirements,
  }).toLowerCase();
  const reflected = /chairman|bless|gov-?precondition|must not cut over|approval required|decision required/.test(haystack);
  if (reflected) return { required: true, satisfied: true, marker: String(marker) };
  // (b) blessed via an approved chairman_decision for this SD.
  try {
    const sdId = sd.id || sd.sd_key;
    const { data } = await supabase
      .from('chairman_decisions')
      .select('id,status')
      .or(`context->>sd_id.eq.${sdId},context->>sd_key.eq.${sd.sd_key || sdId}`)
      .in('status', ['approved', 'reviewed', 'APPROVED', 'REVIEWED'])
      .limit(1);
    if (data && data.length > 0) return { required: true, satisfied: true, marker: String(marker) };
  } catch { /* fail toward surfacing: treat as unsatisfied (advisory by default) */ }
  return { required: true, satisfied: false, marker: String(marker) };
}

async function fetchPrd(ctx) {
  if (ctx?._prd) return ctx._prd;
  const sb = ctx?.supabase;
  const sd = ctx?.sd || {};
  if (!sb) return null;
  // product_requirements_v2.directive_id holds the sd_key; id is PRD-<sdkey>.
  const key = sd.sd_key || sd.id || ctx.sdId;
  try {
    const { data } = await sb
      .from('product_requirements_v2')
      .select('functional_requirements, acceptance_criteria, technical_requirements')
      .or(`directive_id.eq.${key},id.eq.PRD-${key}`)
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

/**
 * Create the SD_PRD_DRIFT gate.
 * @param {Object} [supabaseOverride] optional supabase (else ctx.supabase)
 */
export function createSDPRDDriftGate(supabaseOverride) {
  const enforcing = String(process.env.SD_PRD_DRIFT_ENFORCING || '').toLowerCase() === 'true';
  return {
    name: 'SD_PRD_DRIFT',
    // FR-5: advisory-first — the gate is non-required (advisory) unless enforcing is enabled.
    required: enforcing,
    validator: async (ctx) => {
      console.log('\n🔀 SD↔PRD DRIFT GATE (SD-LEO-INFRA-SD-PRD-DRIFT-GATE-001)');
      console.log('-'.repeat(50));
      const sd = ctx?.sd || {};
      const supabase = supabaseOverride || ctx?.supabase;
      const prd = await fetchPrd({ ...ctx, supabase });

      const sdFrs = extractSdFrs(sd);
      const prdFrs = extractPrdFrs(prd);

      // No extractable SD FRs (or no PRD) → cannot reliably assert drift; no-op (advisory pass).
      if (sdFrs.length === 0 || !prd) {
        console.log(`   ℹ️  No comparable FRs (sdFrs=${sdFrs.length}, prd=${prd ? 'yes' : 'no'}) — drift check skipped.`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details: { skipped: true, sdFrCount: sdFrs.length, prdFrCount: prdFrs.length } };
      }

      const drifted = findDriftedFrs(sdFrs, prdFrs);
      const gov = await checkGovPrecondition(sd, prd, supabase);

      const problems = [];
      for (const f of drifted) problems.push(`SD ${f.id} is absent from the PRD: "${(f.text || '').slice(0, 60)}…"`);
      if (gov.required && !gov.satisfied) {
        problems.push(`Chairman-gated precondition (metadata.chairman_decision_required=${gov.marker}) is NOT reflected in the PRD and has no approved chairman_decision`);
      }

      const remediation = 'PRD re-sync: add the named SD FR(s)/precondition to product_requirements_v2.functional_requirements (and reflect any chairman precondition), then re-validate the PRD before re-running PLAN→EXEC.';
      const details = {
        sdFrCount: sdFrs.length, prdFrCount: prdFrs.length,
        missing_frs: drifted.map((f) => ({ id: f.id, label: (f.text || '').slice(0, 80) })),
        gov_precondition: gov,
        enforcing,
      };

      if (problems.length === 0) {
        console.log(`   ✅ No SD↔PRD drift (${sdFrs.length} SD FR(s) all reflected; gov-precondition ${gov.required ? 'satisfied' : 'n/a'}).`);
        return { passed: true, score: 100, max_score: 100, issues: [], warnings: [], details };
      }

      // FR-3 + FR-5: name the drift; advisory => warnings+pass, enforcing => issues+block.
      console.log(`   ${enforcing ? '❌' : '⚠️'} SD↔PRD drift (${problems.length}) [${enforcing ? 'ENFORCING' : 'ADVISORY'}]:`);
      for (const p of problems) console.log(`      - ${p}`);
      if (enforcing) {
        return { passed: false, score: 0, max_score: 100, issues: problems, warnings: [], remediation, details };
      }
      return { passed: true, score: 100, max_score: 100, issues: [], warnings: [...problems, `(advisory — set SD_PRD_DRIFT_ENFORCING=true to block) ${remediation}`], details };
    },
  };
}

export default { createSDPRDDriftGate, extractSdFrs, extractPrdFrs, sdFrPresentInPrd, findDriftedFrs, checkGovPrecondition };
