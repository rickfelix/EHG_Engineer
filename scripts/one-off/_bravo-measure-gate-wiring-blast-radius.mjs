/**
 * Two-direction blast-radius measurement for the gate-1-plan-to-exec.js prdQualityValidation
 * wiring fix (coordinator ruling on signal 77125dd7): route through validatePRDForHandoff()
 * (score-based leniency) instead of calling validatePRDQuality() directly (strict
 * passed = score>=50 && issues.length===0, independent of score).
 *
 * Full population of product_requirements_v2 joined to strategic_directives_v2.sd_type,
 * paginated, no cap. Splits by heuristic vs AI-rubric path (mirrors validatePRDQuality's own
 * usesHeuristic test) since only the heuristic path is measurable deterministically without
 * live API calls.
 */
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PLACEHOLDER_PATTERNS = ['to be defined','to be determined','tbd','needs definition','will be defined','placeholder','insert here','[add','[define','[specify','during planning','during technical analysis','based on sd objectives','based on success metrics'];
const BOILERPLATE_ACCEPTANCE_CRITERIA = ['all functional requirements implemented','all tests passing','no regressions introduced','code review completed','documentation updated','meets acceptance criteria','user acceptance testing passed','deployment readiness confirmed'];
const BOILERPLATE_REQUIREMENTS = ['to be defined based on sd objectives','to be defined during planning','to be defined during technical analysis','implement the feature','create the functionality','add capability'];
const HEURISTIC_TYPES = ['bugfix','bug_fix','infrastructure','implementation','database','database_schema','quality assurance','quality_assurance','orchestrator','documentation','refactor','theming','ux','design','ui','layout','state-management','feature'];

function containsPlaceholder(text) { if (!text) return false; const n = text.toLowerCase(); return PLACEHOLDER_PATTERNS.some(p => n.includes(p)); }
function isBoilerplate(text, patterns) { if (!text) return false; const n = text.toLowerCase().trim(); return patterns.some(p => n.includes(p.toLowerCase())); }
function normalizeToArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch {} return value.split('\n').map(l=>l.trim()).filter(l=>l.length>0); }
  if (typeof value === 'object') return [value];
  return [];
}

// Mirrors scripts/modules/prd-quality-validation.js's validatePRDHeuristic (post-QF-722 fix)
function validatePRDHeuristic(prd, sdType) {
  const issues = []; const warnings = [];
  let score = 100;
  const reducedPenaltyTypes = ['infrastructure','implementation','fix','bugfix','bug_fix','documentation','refactor','quality_assurance','quality assurance'];
  const useReducedPenalty = reducedPenaltyTypes.includes((sdType||'').toLowerCase());
  const optionalFieldPenalty = useReducedPenalty ? 3 : 5;

  const funcReqs = normalizeToArray(prd.functional_requirements);
  if (!Array.isArray(funcReqs) || funcReqs.length < 3) { issues.push('insufficient_fr'); score -= 15; }
  else {
    const placeholderReqs = funcReqs.filter(req => {
      const text = typeof req === 'string' ? req : [req?.title, req?.description].filter(Boolean).join(' ');
      return containsPlaceholder(text) || isBoilerplate(text, BOILERPLATE_REQUIREMENTS);
    });
    if (placeholderReqs.length > 0) { issues.push(`${placeholderReqs.length} placeholder/boilerplate requirements`); score -= 10 * placeholderReqs.length; }
  }

  const accCriteria = normalizeToArray(prd.acceptance_criteria);
  if (!Array.isArray(accCriteria) || accCriteria.length < 3) { issues.push('insufficient_ac'); score -= 15; }
  else {
    const boilerplateAC = accCriteria.filter(ac => {
      const text = typeof ac === 'string' ? ac : (ac?.criterion || JSON.stringify(ac));
      return isBoilerplate(text, BOILERPLATE_ACCEPTANCE_CRITERIA);
    });
    if (boilerplateAC.length > 0) { warnings.push(`${boilerplateAC.length} boilerplate AC`); score -= 5 * boilerplateAC.length; }
  }

  const testScenarios = normalizeToArray(prd.test_scenarios);
  if (!Array.isArray(testScenarios) || testScenarios.length < 3) { warnings.push('few_ts'); score -= optionalFieldPenalty; }
  if (!prd.system_architecture || Object.keys(prd.system_architecture).length === 0) { warnings.push('missing_sa'); score -= optionalFieldPenalty; }
  if (!prd.implementation_approach || Object.keys(prd.implementation_approach).length === 0) { warnings.push('missing_ia'); score -= optionalFieldPenalty; }
  const risks = prd.risks || [];
  if (!Array.isArray(risks) || risks.length === 0) { warnings.push('no_risks'); score -= optionalFieldPenalty; }
  const summary = prd.executive_summary || '';
  if (summary.length < 50) { warnings.push('short_summary'); score -= 5; }

  score = Math.max(0, Math.min(100, score));
  const oldPassed = score >= 50 && issues.length === 0; // current gate wiring (validatePRDQuality direct)
  const newValid = score >= 50; // proposed wiring (validatePRDForHandoff-style leniency)
  return { score, issues, oldPassed, newValid };
}

async function main() {
  const PAGE = 1000;
  let from = 0;
  let prds = [];
  for (;;) {
    const { data, error } = await supabase.from('product_requirements_v2').select('id, sd_id, functional_requirements, acceptance_criteria, test_scenarios, system_architecture, implementation_approach, risks, executive_summary').range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    prds = prds.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Fetched ${prds.length} PRD rows (full population, paginated, no cap).`);

  // Fetch sd_type for every referenced sd_id (paginated)
  const sdIds = [...new Set(prds.map(p => p.sd_id).filter(Boolean))];
  const sdTypeById = new Map();
  const SD_PAGE = 200;
  for (let i = 0; i < sdIds.length; i += SD_PAGE) {
    const batch = sdIds.slice(i, i + SD_PAGE);
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const { data, error } = await supabase.from('strategic_directives_v2').select('id, sd_type').in('id', batch);
        if (error) throw error;
        for (const row of data || []) sdTypeById.set(row.id, row.sd_type);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.log(`  retry ${attempt} for sd_type batch at ${i} after: ${e.message}`);
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    if (i % 1000 === 0) console.log(`  sd_type batch progress: ${i}/${sdIds.length}`);
  }

  let heuristicCount = 0, aiCount = 0;
  let oldOnly = 0, newOnly = 0, both = 0, neither = 0;
  const newOnlyExamples = [];
  const oldOnlyExamples = [];

  for (const prd of prds) {
    const sdType = (sdTypeById.get(prd.sd_id) || '').toLowerCase();
    const usesHeuristic = HEURISTIC_TYPES.includes(sdType);
    if (!usesHeuristic) { aiCount++; continue; }
    heuristicCount++;
    const { score, issues, oldPassed, newValid } = validatePRDHeuristic(prd, sdType);
    if (!oldPassed && newValid) {
      newOnly++;
      if (newOnlyExamples.length < 5) newOnlyExamples.push({ prd_id: prd.id, score, issues });
    } else if (oldPassed && !newValid) {
      oldOnly++; // currently PASSES, would newly FAIL -- the regression count that must be zero
      if (oldOnlyExamples.length < 5) oldOnlyExamples.push({ prd_id: prd.id, score, issues });
    } else if (oldPassed && newValid) {
      both++;
    } else {
      neither++;
    }
  }

  console.log(`\nPopulation split: heuristic-path PRDs = ${heuristicCount}, AI-rubric-path PRDs = ${aiCount} (sd_type not in HEURISTIC_TYPES)`);
  console.log('\n=== HEURISTIC-PATH TWO-DIRECTION BLAST RADIUS (deterministic, no API calls) ===');
  console.log(`(newly PASS) currently blocked, would newly pass under the fix: ${newOnly}`);
  console.log(`(newly FAIL) currently passes, would newly fail under the fix -- MUST BE ZERO: ${oldOnly}`);
  console.log(`(both pass, unaffected): ${both}`);
  console.log(`(both fail, unaffected): ${neither}`);
  if (oldOnly > 0) {
    console.log('\n!!! REGRESSION EXAMPLES (bring to coordinator, do not proceed):', JSON.stringify(oldOnlyExamples, null, 2));
  }
  if (newOnly > 0 && newOnly <= 20) {
    console.log('\nnewly-pass examples:', JSON.stringify(newOnlyExamples, null, 2));
  }
  console.log(`\nAI-rubric-path PRDs (${aiCount}) are NOT covered by this deterministic measurement -- see follow-up check against ai_quality_assessments.`);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
}
