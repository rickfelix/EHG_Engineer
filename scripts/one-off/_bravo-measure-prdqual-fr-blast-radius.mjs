/**
 * Two-direction blast-radius measurement for the prd-quality-validation.js
 * functional_requirements text-derivation fix (QF, coordinator ruling on
 * signal 1fcb4d00, condition 2).
 *
 * OLD predicate (current code, prd-quality-validation.js:158-160):
 *   text = typeof req === 'string' ? req : (req.requirement || JSON.stringify(req))
 * NEW predicate (proposed fix):
 *   text = typeof req === 'string' ? req : [req.title, req.description].filter(Boolean).join(' ')
 *
 * Applies containsPlaceholder() || isBoilerplate(text, BOILERPLATE_REQUIREMENTS) under
 * BOTH predicates to every functional_requirements entry across the FULL population of
 * product_requirements_v2 (not a capped sample — paginated fetch), and reports counts in
 * BOTH directions per the ruling's explicit requirement:
 *   (a) entries flagged under OLD but not NEW (false positives fixed)
 *   (b) entries flagged under NEW but not OLD (should not happen, sanity check)
 *   (c) entries flagged under OLD AND NEW (real placeholder content, unaffected)
 * If (a) is nonzero while a nested field (e.g. acceptance_criteria) inside the SAME entry
 * still carries the offending substring, that is a genuine "stops being caught" case and is
 * reported separately, per the ruling's explicit second-number requirement.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PLACEHOLDER_PATTERNS = [
  'to be defined', 'to be determined', 'tbd', 'needs definition', 'will be defined',
  'placeholder', 'insert here', '[add', '[define', '[specify', 'during planning',
  'during technical analysis', 'based on sd objectives', 'based on success metrics',
];
const BOILERPLATE_REQUIREMENTS = [
  'to be defined based on sd objectives', 'to be defined during planning',
  'to be defined during technical analysis', 'implement the feature',
  'create the functionality', 'add capability',
];

function containsPlaceholder(text) {
  if (!text) return false;
  const n = text.toLowerCase();
  return PLACEHOLDER_PATTERNS.some(p => n.includes(p));
}
function isBoilerplate(text, patterns) {
  if (!text) return false;
  const n = text.toLowerCase().trim();
  return patterns.some(p => n.includes(p.toLowerCase()));
}
function flagged(text) {
  return containsPlaceholder(text) || isBoilerplate(text, BOILERPLATE_REQUIREMENTS);
}
function normalizeToArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; }
    catch { /* not JSON */ }
    return value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }
  if (typeof value === 'object') return [value];
  return [];
}

async function main() {
  const PAGE = 1000;
  let from = 0;
  let allRows = [];
  for (;;) {
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .select('id, sd_id, functional_requirements')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Fetched ${allRows.length} PRD rows (full population, paginated, no cap).`);

  let entriesTotal = 0;
  let oldOnly = 0;      // flagged OLD, not NEW  -> false positives fixed
  let newOnly = 0;      // flagged NEW, not OLD  -> sanity check, should be 0
  let both = 0;         // flagged under both     -> real placeholder content, unaffected
  let neither = 0;
  const oldOnlyButNestedStillHits = []; // "stops being caught" cases: OLD-only AND acceptance_criteria still hits
  const newOnlyExamples = [];
  const prdsAffected = new Set(); // PRDs whose overall flagged-count changes (oldOnly>0 for that PRD)

  for (const row of allRows) {
    const funcReqs = normalizeToArray(row.functional_requirements);
    let prdHadOldOnly = false;
    for (const req of funcReqs) {
      entriesTotal++;
      const oldText = typeof req === 'string' ? req : (req?.requirement || JSON.stringify(req));
      const newText = typeof req === 'string' ? req : [req?.title, req?.description].filter(Boolean).join(' ');
      const oldFlag = flagged(oldText);
      const newFlag = flagged(newText);
      if (oldFlag && !newFlag) {
        oldOnly++;
        prdHadOldOnly = true;
        // Check whether nested acceptance_criteria (part of the FR object, not covered by
        // the new title+description derivation) still independently carries the pattern —
        // that is the genuine "stops being caught" case the ruling asked to surface.
        const nestedAC = req && typeof req === 'object' ? req.acceptance_criteria : null;
        const nestedText = Array.isArray(nestedAC) ? nestedAC.join(' ') : (typeof nestedAC === 'string' ? nestedAC : '');
        if (flagged(nestedText)) {
          oldOnlyButNestedStillHits.push({ prd_id: row.id, sd_id: row.sd_id, req_id: req?.id, nestedText: nestedText.slice(0, 120) });
        }
      } else if (newFlag && !oldFlag) {
        newOnly++;
        if (newOnlyExamples.length < 5) newOnlyExamples.push({ prd_id: row.id, sd_id: row.sd_id, req_id: req?.id, newText });
      } else if (oldFlag && newFlag) {
        both++;
      } else {
        neither++;
      }
    }
    if (prdHadOldOnly) prdsAffected.add(row.id);
  }

  console.log('\n=== TWO-DIRECTION BLAST RADIUS (full population, N=' + allRows.length + ' PRDs, ' + entriesTotal + ' FR entries) ===');
  console.log(`(a) OLD-only (false positives FIXED by the new derivation): ${oldOnly} FR entries across ${prdsAffected.size} PRDs`);
  console.log(`(b) NEW-only (newly caught, NOT caught before — should be 0): ${newOnly} FR entries`);
  console.log(`(c) BOTH (real placeholder content, unaffected either way): ${both} FR entries`);
  console.log(`    neither: ${neither} FR entries`);
  console.log(`\n"Stops being caught" cases (OLD flagged the FR only via a nested field the new`);
  console.log(`derivation excludes, AND that nested field independently still carries the pattern):`);
  console.log(`  count: ${oldOnlyButNestedStillHits.length}`);
  if (oldOnlyButNestedStillHits.length > 0) {
    console.log('  examples:', JSON.stringify(oldOnlyButNestedStillHits.slice(0, 10), null, 2));
  }
  if (newOnly > 0) {
    console.log('\n  NEW-only examples (unexpected — investigate):', JSON.stringify(newOnlyExamples, null, 2));
  }
}

main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
