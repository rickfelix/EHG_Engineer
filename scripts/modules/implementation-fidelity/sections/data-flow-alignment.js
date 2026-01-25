/**
 * Section C: Data Flow Alignment (25 points)
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 */

import { getSDSearchTerms, gitLogForSD, detectImplementationRepo } from '../utils/index.js';

/**
 * Validate Data Flow Alignment
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} designAnalysis - Design analysis from PRD metadata
 * @param {Object} databaseAnalysis - Database analysis from PRD metadata
 * @param {Object} validation - Validation object to populate
 * @param {Object} supabase - Supabase client
 */
export async function validateDataFlowAlignment(sd_id, designAnalysis, databaseAnalysis, validation, supabase) {
  // SD-CAPITAL-FLOW-001: Check if this is a database SD without UI/form requirements
  try {
    let sd = null;
    const { data: sdById } = await supabase
      .from('strategic_directives_v2')
      .select('sd_type, scope')
      .eq('id', sd_id)
      .single();

    if (sdById) {
      sd = sdById;
    } else {
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id, use sd_key instead (column dropped 2026-01-24)
      const { data: sdBySdKey } = await supabase
        .from('strategic_directives_v2')
        .select('sd_type, scope')
        .eq('sd_key', sd_id)
        .single();
      sd = sdBySdKey;
    }

    if (sd?.sd_type === 'database') {
      let scopeToCheck = '';
      if (typeof sd.scope === 'object' && sd.scope?.included) {
        scopeToCheck = Array.isArray(sd.scope.included)
          ? sd.scope.included.join(' ')
          : String(sd.scope.included);
      } else if (typeof sd.scope === 'string') {
        try {
          const parsed = JSON.parse(sd.scope);
          if (parsed?.included) {
            scopeToCheck = Array.isArray(parsed.included)
              ? parsed.included.join(' ')
              : String(parsed.included);
          }
        } catch {
          scopeToCheck = sd.scope;
        }
      }

      const hasUIScope = /component|ui\s|frontend|form|page|view/i.test(scopeToCheck);

      if (!hasUIScope) {
        console.log('   ✅ Database SD without UI/form requirements - Section C not applicable (25/25)');
        validation.score += 25;
        validation.gate_scores.data_flow_alignment = 25;
        validation.details.data_flow_alignment = {
          skipped: true,
          reason: 'Database SD without UI/form requirements - data flow alignment not applicable'
        };
        return;
      }
    }
  } catch (_e) {
    // Continue with normal validation
  }

  const exemptSections = validation.details.gate2_exempt_sections || [];
  const isC1Exempt = exemptSections.includes('C1_queries');
  const isC2Exempt = exemptSections.includes('C2_form_integration');

  let sectionScore = 0;
  const sectionDetails = {};
  sectionDetails.exemptions = { C1: isC1Exempt, C2: isC2Exempt };

  console.log('\n   [C] Data Flow Alignment...');

  // Get gitDiff for all C checks
  let gitDiff = '';
  try {
    const searchTerms = await getSDSearchTerms(sd_id, supabase);
    const implementationRepo = await detectImplementationRepo(sd_id, supabase);
    gitDiff = await gitLogForSD(
      `git -C "${implementationRepo}" log --all --grep="\${TERM}" --pretty=format:"" --patch`,
      searchTerms,
      { timeout: 15000 }
    );
  } catch (_e) {
    gitDiff = '';
  }

  // C1: Check for database query code (10 points)
  console.log('\n   [C1] Database Query Integration...');

  if (isC1Exempt) {
    sectionScore += 10;
    sectionDetails.C1_exempt = true;
    console.log('   ✅ C1 exempt for this SD type - full credit (10/10)');
  } else {
    const hasQueries = gitDiff.includes('.select(') ||
                       gitDiff.includes('.insert(') ||
                       gitDiff.includes('.update(') ||
                       gitDiff.includes('.from(');

    if (hasQueries) {
      sectionScore += 10;
      sectionDetails.database_queries_found = true;
      console.log('   ✅ Database queries found in code changes');
    } else {
      validation.warnings.push('[C1] No database queries detected in code');
      sectionScore += 5;
      console.log('   ⚠️  No database queries detected (5/10)');
    }
  }

  // C2: Check for form/UI integration (10 points)
  console.log('\n   [C2] Form/UI Integration...');

  if (isC2Exempt) {
    sectionScore += 10;
    sectionDetails.C2_exempt = true;
    console.log('   ✅ C2 exempt for this SD type - full credit (10/10)');
  } else {
    const hasFormIntegration = gitDiff.includes('useState') ||
                                gitDiff.includes('useForm') ||
                                gitDiff.includes('onSubmit') ||
                                gitDiff.includes('<form') ||
                                gitDiff.includes('Input') ||
                                gitDiff.includes('Button');

    if (hasFormIntegration) {
      sectionScore += 10;
      sectionDetails.form_integration_found = true;
      console.log('   ✅ Form/UI integration found');
    } else {
      validation.warnings.push('[C2] No form/UI integration detected');
      sectionScore += 5;
      console.log('   ⚠️  No form/UI integration detected (5/10)');
    }
  }

  // C3: Check for data validation (5 points)
  console.log('\n   [C3] Data Validation...');

  const hasValidation = gitDiff.includes('zod') ||
                        gitDiff.includes('validate') ||
                        gitDiff.includes('schema') ||
                        gitDiff.includes('.required()');

  if (hasValidation) {
    sectionScore += 5;
    sectionDetails.data_validation_found = true;
    console.log('   ✅ Data validation found');
  } else {
    validation.warnings.push('[C3] No data validation detected');
    sectionScore += 3;
    console.log('   ⚠️  No data validation detected (3/5)');
  }

  validation.score += sectionScore;
  validation.gate_scores.data_flow_alignment = sectionScore;
  validation.details.data_flow_alignment = sectionDetails;
  console.log(`\n   Section C Score: ${sectionScore}/25`);
}
