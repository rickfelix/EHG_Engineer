#!/usr/bin/env node
/**
 * VERIFY-phase VALIDATION (evidence 18b5d248, PASS/88) found the PRD's own record had fallen
 * behind the shipped code (F-3): FR-3's description stops at PLAN pass 5 and never records the
 * EXEC-phase cf40b474 correction (the guard's 3rd disjunct on control_pack_evaluated itself),
 * making the CODE look non-conforming to a future reviewer when it's actually the PRD lagging.
 * Also records F-1 (boolean baseline correction) and F-5 (disabled-trigger detection) for the
 * same reason -- keep the PRD's own text in sync with what shipped.
 */
import { readFileSync, writeFileSync } from 'fs';

const PATH = 'scripts/temp/prd-summary-columns-derived-001.json';
const prd = JSON.parse(readFileSync(PATH, 'utf8'));
const byId = (arr, id) => arr.find((x) => x.id === id);

const fr3 = byId(prd.functional_requirements, 'FR-3');
fr3.description +=
  " EXEC-phase TESTING (evidence cf40b474, CRITICAL-1) found this description's history stopped short of a real gap: the 2-disjunct guard let a writer set control_pack_evaluated DIRECTLY (bypassing control_pack_status entirely) and the wrong value stuck -- proven live. Fixed by adding a third disjunct (OLD.metadata->'control_pack_evaluated' IS DISTINCT FROM NEW.metadata->'control_pack_evaluated'), making the trigger self-healing regardless of which key a writer touches; re-verified live (evidence d76ec942, PASS/94) with a positive control reproducing the original drift against the pre-fix guard before confirming the fix closes it. The same pass also found the DOWN file's TR-2 snapshot was taken AFTER the trigger had been live (CRITICAL-2) -- moved into the UP file, immediately before CREATE TRIGGER, with a NOT EXISTS guard added afterward (VERIFY-phase TESTING evidence d76ec942's own follow-on MEDIUM) so a re-apply never appends a second, post-derivation batch. VERIFY-phase VALIDATION (evidence 18b5d248, F-5) additionally found the UP file's existence-only trigger check would pass on a DISABLED trigger; added tgenabled != 'D' to close it.";

const fr2 = byId(prd.functional_requirements, 'FR-2');
fr2.acceptance_criteria = fr2.acceptance_criteria.map((c) =>
  c.replace(
    'PRD/documentation records the corrected 7-column boolean baseline',
    "PRD/documentation records the boolean baseline as measured live (corrected twice: LEAD-phase VALIDATION's original 7-name list itself contained 2 phantom names never live in the schema and missed 5 real ones -- VERIFY-phase VALIDATION evidence 18b5d248 re-measured and corrected scripts/lint/summary-column-derivation-lint.mjs's BASELINE_BOOLEAN_COLUMNS to the current 11-name live set)"
  )
);

writeFileSync(PATH, JSON.stringify(prd, null, 2));
console.log('PRD updated: FR-3 history now records cf40b474/d76ec942/18b5d248; FR-2 baseline claim corrected.');
