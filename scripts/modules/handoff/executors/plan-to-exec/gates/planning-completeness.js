/**
 * Planning Completeness Gate
 * SD-LEO-INFRA-UNIVERSAL-PLANNING-COMPLETENESS-003
 *
 * 3-Ring validation model:
 *   Ring 1: Individual SD — PRD, deliverables, sd_type-specific artifacts
 *   Ring 2: Orchestrator Coherence — parent-child relationships, sibling completeness
 *   Ring 3: Venture Foundation — vision document, architecture plan linkage
 *
 * 4-Level cascade per ring:
 *   L1: Existence — artifact record exists
 *   L2: Structure — required fields populated
 *   L3: Anti-Dummy — content exceeds minimum thresholds
 *   L4: Substance — quality indicators (advisory)
 */

// SD types that hard-block on planning completeness failure
const BLOCKING_SD_TYPES = ['feature', 'infrastructure', 'database', 'security', 'frontend'];
// SD types where planning completeness is advisory only
const ADVISORY_SD_TYPES = ['fix', 'bugfix', 'documentation', 'docs', 'enhancement', 'quick_fix', 'uat'];

// Anti-dummy minimum thresholds
const MIN_EXECUTIVE_SUMMARY_LENGTH = 50;
const MIN_FUNCTIONAL_REQUIREMENTS = 1;

/**
 * Create the GATE_PLANNING_COMPLETENESS gate validator
 */
export function createPlanningCompletenessGate(supabase, sd) {
  const sdType = (sd.sd_type || 'feature').toLowerCase();
  const isBlocking = BLOCKING_SD_TYPES.includes(sdType);

  return {
    name: 'GATE_PLANNING_COMPLETENESS',
    validator: async () => {
      console.log('\n📋 GATE: Planning Completeness Check');
      console.log('-'.repeat(50));
      console.log(`   SD Type: ${sdType}`);
      console.log(`   Mode: ${isBlocking ? 'BLOCKING' : 'ADVISORY'}`);
      return validatePlanningCompleteness(supabase, sd);
    },
    required: isBlocking
  };
}

/**
 * Validate planning completeness across all three rings
 */
export async function validatePlanningCompleteness(supabase, sd) {
  const issues = [];
  const warnings = [];
  const details = { rings: {} };
  const sdType = (sd.sd_type || 'feature').toLowerCase();
  const isBlocking = BLOCKING_SD_TYPES.includes(sdType);

  // Get SD type profile
  const { data: profile } = await supabase
    .from('sd_type_validation_profiles')
    .select('requires_prd, requires_deliverables')
    .eq('sd_type', sdType)
    .single();

  // Run all three rings in parallel
  const [ring1, ring2, ring3] = await Promise.all([
    validateIndividualSD(supabase, sd, profile),
    validateOrchestratorCoherence(supabase, sd),
    validateVentureFoundation(supabase, sd)
  ]);

  details.rings.individual = ring1;
  details.rings.orchestrator = ring2;
  details.rings.venture = ring3;

  // Collect issues and warnings from all rings
  issues.push(...ring1.issues);
  warnings.push(...ring1.warnings, ...ring2.warnings, ...ring3.warnings);

  // Orchestrator issues are advisory (warnings only)
  // Venture issues are always advisory
  // Only individual SD ring can produce blocking issues

  // Calculate score: Individual ring = 60%, Orchestrator = 25%, Venture = 15%
  const score = Math.round(
    (ring1.score * 0.60) +
    (ring2.score * 0.25) +
    (ring3.score * 0.15)
  );
  const maxScore = 100;

  const passed = isBlocking ? issues.length === 0 : true;

  // Build remediation for failures
  const remediation = [];
  if (ring1.remediation.length > 0) {
    remediation.push('Individual SD Ring:', ...ring1.remediation.map(r => '  - ' + r));
  }
  if (ring2.remediation.length > 0) {
    remediation.push('Orchestrator Ring:', ...ring2.remediation.map(r => '  - ' + r));
  }
  if (ring3.remediation.length > 0) {
    remediation.push('Venture Ring:', ...ring3.remediation.map(r => '  - ' + r));
  }

  // Display summary
  console.log(`\n   📊 Planning Completeness Summary:`);
  console.log(`      Ring 1 (Individual SD): ${ring1.score}% ${ring1.issues.length === 0 ? '✅' : '❌'}`);
  console.log(`      Ring 2 (Orchestrator):  ${ring2.score}% ${ring2.warnings.length === 0 ? '✅' : '⚠️'}`);
  console.log(`      Ring 3 (Venture):       ${ring3.score}% ${ring3.warnings.length === 0 ? '✅' : '⚠️'}`);
  console.log(`      Overall: ${score}% | ${passed ? 'PASSED' : 'FAILED'} (${isBlocking ? 'blocking' : 'advisory'})`);

  return {
    passed,
    score,
    max_score: maxScore,
    issues,
    warnings,
    details,
    remediation: remediation.length > 0 ? remediation.join('\n') : undefined
  };
}

// ─── Ring 1: Individual SD ───────────────────────────────────────────────

async function validateIndividualSD(supabase, sd, profile) {
  const issues = [];
  const warnings = [];
  const remediation = [];
  let score = 100;
  const sdType = (sd.sd_type || 'feature').toLowerCase();
  const requiresPrd = profile?.requires_prd ?? true;

  console.log(`\n   🔵 Ring 1: Individual SD Validation`);

  // --- PRD Check (L1: Existence) ---
  if (requiresPrd) {
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id, title, status, executive_summary, functional_requirements')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!prd) {
      issues.push(`PRD required for ${sdType} type but not found`);
      remediation.push(`Create PRD: node scripts/add-prd-to-database.js`);
      score -= 40;
      console.log(`      L1 PRD Existence: ❌ Not found`);
    } else {
      console.log(`      L1 PRD Existence: ✅ ${prd.title}`);

      // L2: Structure — required fields populated
      const prdStatus = prd.status || 'draft';
      const validStatuses = ['approved', 'verification', 'in_progress', 'ready_for_exec', 'completed'];
      if (!validStatuses.includes(prdStatus)) {
        warnings.push(`PRD status is '${prdStatus}', expected one of: ${validStatuses.join(', ')}`);
        score -= 10;
        console.log(`      L2 PRD Structure: ⚠️ Status '${prdStatus}' not ideal`);
      } else {
        console.log(`      L2 PRD Structure: ✅ Status '${prdStatus}'`);
      }

      // L3: Anti-Dummy — content exceeds minimums
      const execSummary = prd.executive_summary || '';
      if (execSummary.length < MIN_EXECUTIVE_SUMMARY_LENGTH) {
        issues.push(`PRD executive_summary is too short (${execSummary.length} chars, minimum ${MIN_EXECUTIVE_SUMMARY_LENGTH})`);
        remediation.push(`Update PRD executive_summary to be at least ${MIN_EXECUTIVE_SUMMARY_LENGTH} characters`);
        score -= 15;
        console.log(`      L3 Anti-Dummy: ❌ executive_summary too short (${execSummary.length}/${MIN_EXECUTIVE_SUMMARY_LENGTH})`);
      } else {
        const dummyPatterns = /^(tbd|todo|placeholder|lorem ipsum|fill in|coming soon|n\/a)$/i;
        if (dummyPatterns.test(execSummary.trim())) {
          issues.push(`PRD executive_summary contains placeholder text`);
          remediation.push(`Replace PRD executive_summary placeholder with actual content`);
          score -= 15;
          console.log(`      L3 Anti-Dummy: ❌ Placeholder text detected`);
        } else {
          console.log(`      L3 Anti-Dummy: ✅ executive_summary substantial (${execSummary.length} chars)`);
        }
      }

      // L3: Anti-Dummy — functional requirements
      const funcReqs = prd.functional_requirements || [];
      if (Array.isArray(funcReqs) && funcReqs.length < MIN_FUNCTIONAL_REQUIREMENTS) {
        warnings.push(`PRD has ${funcReqs.length} functional requirements (minimum ${MIN_FUNCTIONAL_REQUIREMENTS})`);
        score -= 10;
        console.log(`      L3 Anti-Dummy: ⚠️ Only ${funcReqs.length} functional requirements`);
      } else {
        const count = Array.isArray(funcReqs) ? funcReqs.length : 0;
        console.log(`      L3 Anti-Dummy: ✅ ${count} functional requirements`);
      }

      // L4: Substance (advisory only)
      if (execSummary.length > 200) {
        console.log(`      L4 Substance: ✅ Detailed executive summary (${execSummary.length} chars)`);
      } else {
        warnings.push(`PRD executive_summary is minimal (${execSummary.length} chars). Consider expanding.`);
        console.log(`      L4 Substance: ⚠️ Minimal executive summary`);
      }
    }
  } else {
    console.log(`      ℹ️  PRD not required for ${sdType} type — skipped`);
  }

  // --- Deliverables Check (L1: Existence) ---
  const { data: deliverables } = await supabase
    .from('sd_scope_deliverables')
    .select('id, deliverable_name')
    .eq('sd_id', sd.id);

  const deliverableCount = deliverables?.length || 0;
  if (deliverableCount === 0) {
    warnings.push('No deliverables defined in sd_scope_deliverables');
    remediation.push('Define deliverables or let auto-populate from PRD');
    score -= 5;
    console.log(`      L1 Deliverables: ⚠️ None defined`);
  } else {
    console.log(`      L1 Deliverables: ✅ ${deliverableCount} defined`);
  }

  return { score: Math.max(0, score), issues, warnings, remediation };
}

// ─── Ring 2: Orchestrator Coherence ──────────────────────────────────────

async function validateOrchestratorCoherence(supabase, sd) {
  const warnings = [];
  const remediation = [];
  let score = 100;

  console.log(`\n   🟡 Ring 2: Orchestrator Coherence`);

  // Check if this SD has a parent (is a child)
  if (!sd.parent_sd_id) {
    // Check if this SD IS a parent (has children)
    const { data: children } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .eq('parent_sd_id', sd.id);

    if (!children || children.length === 0) {
      console.log(`      ℹ️  Standalone SD — no orchestrator context`);
      return { score: 100, warnings: [], remediation: [] };
    }

    // This is a parent orchestrator — check children status
    const incompleteChildren = children.filter(c => c.status !== 'completed');
    console.log(`      Parent orchestrator with ${children.length} children`);
    console.log(`      Completed: ${children.length - incompleteChildren.length} | Pending: ${incompleteChildren.length}`);

    if (incompleteChildren.length > 0) {
      warnings.push(`${incompleteChildren.length} child SD(s) not yet completed`);
    }

    return { score, warnings, remediation };
  }

  // This is a child SD — validate parent and siblings
  console.log(`      Child SD — validating parent orchestrator`);

  // Get parent
  const { data: parent } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status')
    .eq('id', sd.parent_sd_id)
    .single();

  if (!parent) {
    warnings.push(`Parent SD ${sd.parent_sd_id} not found`);
    score -= 20;
    console.log(`      ⚠️ Parent not found: ${sd.parent_sd_id}`);
    return { score, warnings, remediation };
  }

  console.log(`      Parent: ${parent.sd_key} (${parent.status})`);

  // Get siblings
  const { data: siblings } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, status')
    .eq('parent_sd_id', sd.parent_sd_id);

  const siblingCount = siblings?.length || 0;
  const completedSiblings = siblings?.filter(s => s.status === 'completed').length || 0;

  console.log(`      Siblings: ${siblingCount} total, ${completedSiblings} completed`);

  // Check for dependency issues among siblings
  const { data: deps } = await supabase
    .from('strategic_directives_v2')
    .select('id, dependencies')
    .eq('parent_sd_id', sd.parent_sd_id);

  if (deps) {
    const siblingIds = new Set(siblings?.map(s => s.id) || []);
    const blockedSiblings = deps.filter(d => {
      const depList = Array.isArray(d.dependencies) ? d.dependencies : [];
      return depList.some(dep => siblingIds.has(dep) && dep !== d.id);
    });
    if (blockedSiblings.length > 0) {
      console.log(`      ℹ️  ${blockedSiblings.length} siblings have inter-dependencies`);
    }
  }

  return { score, warnings, remediation };
}

// ─── Ring 3: Venture Foundation ──────────────────────────────────────────

async function validateVentureFoundation(supabase, sd) {
  const warnings = [];
  const remediation = [];
  let score = 100;

  console.log(`\n   🟢 Ring 3: Venture Foundation`);

  // Check if SD has a venture_id
  if (!sd.venture_id) {
    console.log(`      ℹ️  No venture_id — skipping venture validation`);
    return { score: 100, warnings: [], remediation: [] };
  }

  console.log(`      Venture ID: ${sd.venture_id}`);

  // L1: Check for vision document
  const { data: visions } = await supabase
    .from('eva_vision_documents')
    .select('vision_key, status, content')
    .eq('venture_id', sd.venture_id)
    .eq('status', 'active');

  if (!visions || visions.length === 0) {
    warnings.push(`No active vision document found for venture ${sd.venture_id}`);
    remediation.push(`Create vision document: run brainstorm → vision pipeline for venture`);
    score -= 20;
    console.log(`      L1 Vision: ⚠️ Not found`);
  } else {
    console.log(`      L1 Vision: ✅ ${visions.length} active vision(s)`);

    // L3: Anti-dummy on vision content
    const vision = visions[0];
    const visionContent = typeof vision.content === 'string' ? vision.content : JSON.stringify(vision.content || '');
    if (visionContent.length < 100) {
      warnings.push(`Vision document content is minimal (${visionContent.length} chars)`);
      score -= 10;
      console.log(`      L3 Anti-Dummy: ⚠️ Vision content minimal`);
    } else {
      console.log(`      L3 Anti-Dummy: ✅ Vision content substantial`);
    }
  }

  // L1: Check for architecture plan
  const { data: archPlans } = await supabase
    .from('eva_architecture_plans')
    .select('plan_key, status, vision_key, content')
    .eq('venture_id', sd.venture_id)
    .eq('status', 'active');

  if (!archPlans || archPlans.length === 0) {
    warnings.push(`No active architecture plan found for venture ${sd.venture_id}`);
    remediation.push(`Create architecture plan for venture`);
    score -= 15;
    console.log(`      L1 Architecture: ⚠️ Not found`);
  } else {
    console.log(`      L1 Architecture: ✅ ${archPlans.length} active plan(s)`);

    // Check vision-to-architecture linkage
    const unlinked = archPlans.filter(p => !p.vision_key);
    if (unlinked.length > 0) {
      warnings.push(`${unlinked.length} architecture plan(s) not linked to vision (vision_key is null)`);
      remediation.push(`Link architecture plans to vision: UPDATE eva_architecture_plans SET vision_key = '<key>'`);
      score -= 10;
      console.log(`      L2 Linkage: ⚠️ ${unlinked.length} unlinked plan(s)`);
    } else {
      console.log(`      L2 Linkage: ✅ All plans linked to vision`);
    }
  }

  return { score: Math.max(0, score), warnings, remediation };
}

export { BLOCKING_SD_TYPES, ADVISORY_SD_TYPES };
