/**
 * Gap Detection Orchestrator
 *
 * Coordinates the full gap detection pipeline:
 * 1. Extract requirements from PRD
 * 2. Analyze deliverables from git
 * 3. Detect gaps between requirements and deliverables
 * 4. Classify root causes
 * 5. Create corrective SDs (optional)
 * 6. Store results in gap_analysis_results
 */

import { createClient } from '@supabase/supabase-js';
import { extractRequirements } from './extractors/prd-requirement-extractor.js';
import { analyzeDeliverables } from './analyzers/deliverable-analyzer.js';
import { detectGaps } from './detectors/gap-detection-engine.js';
import { classifyRootCauses } from './classifiers/root-cause-classifier.js';
import { createCorrectiveSDs } from './creators/corrective-sd-creator.js';

const ANALYZER_VERSION = '1.0.0';

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Run the full gap analysis pipeline for an SD.
 * @param {string} sdKey - The SD key to analyze
 * @param {object} options - { createCorrectiveSDs: boolean, dryRun: boolean, verbose: boolean }
 * @returns {Promise<object>} Complete analysis result
 */
export async function runGapAnalysis(sdKey, options = {}) {
  const startTime = Date.now();
  const {
    createCorrectiveSDs: shouldCreateSDs = false,
    dryRun = false,
    verbose = false,
    analysisType = 'retroactive'
  } = options;

  const result = {
    sd_key: sdKey,
    analysis_type: analysisType,
    total_requirements: 0,
    matched_requirements: 0,
    coverage_score: null,
    gap_findings: [],
    false_positive_count: 0,
    corrective_sds_created: [],
    prd_id: null,
    analysis_metadata: {
      timing_ms: 0,
      git_range: null,
      files_analyzed: 0,
      analyzer_version: ANALYZER_VERSION,
      prd_status: null
    },
    error: null
  };

  try {
    // Step 1: Extract requirements
    if (verbose) console.log(`  [1/5] Extracting requirements for ${sdKey}...`);
    const reqResult = await extractRequirements(sdKey);
    result.prd_id = reqResult.prd_id;
    result.analysis_metadata.prd_status = reqResult.error || reqResult.prd_status || 'found';

    // Step 2: Analyze deliverables
    if (verbose) console.log('  [2/5] Analyzing deliverables...');
    const delResult = await analyzeDeliverables(sdKey);
    result.analysis_metadata.git_range = delResult.metadata?.git_range;
    result.analysis_metadata.strategy = delResult.metadata?.strategy;
    result.analysis_metadata.files_analyzed = delResult.metadata?.files_analyzed || 0;

    if (delResult.error) {
      result.analysis_metadata.deliverable_error = delResult.error;
    }

    // Step 3: Detect gaps
    if (verbose) console.log('  [3/5] Detecting gaps...');
    const gapResult = detectGaps(reqResult.requirements, delResult.deliverables);
    result.total_requirements = gapResult.total;
    result.matched_requirements = gapResult.matched_count;
    result.coverage_score = gapResult.coverage_score;

    // Step 4: Classify root causes
    if (verbose) console.log('  [4/5] Classifying root causes...');
    const classifiedGaps = await classifyRootCauses(gapResult.gaps, sdKey);
    result.gap_findings = classifiedGaps;

    // Step 5: Create corrective SDs (optional)
    if (shouldCreateSDs && classifiedGaps.length > 0) {
      if (verbose) console.log('  [5/5] Creating corrective SDs...');
      const sdResult = await createCorrectiveSDs(classifiedGaps, sdKey, { dryRun });
      result.corrective_sds_created = sdResult.created.map(c => c.sd_key).filter(Boolean);

      if (sdResult.errors.length > 0) {
        result.analysis_metadata.sd_creation_errors = sdResult.errors;
      }
    } else if (verbose) {
      console.log('  [5/5] Corrective SD creation skipped');
    }

    // Calculate timing
    result.analysis_metadata.timing_ms = Date.now() - startTime;

    // Store results
    await storeResults(result);

    return result;
  } catch (err) {
    result.error = err.message;
    result.analysis_metadata.timing_ms = Date.now() - startTime;

    // Try to store partial results
    try {
      await storeResults(result);
    } catch {
      // If storage fails, just log
      console.error(`  Failed to store results for ${sdKey}: ${err.message}`);
    }

    return result;
  }
}

async function storeResults(result) {
  const sb = getSupabase();

  const { error } = await sb.from('gap_analysis_results').insert({
    sd_key: result.sd_key,
    analysis_type: result.analysis_type,
    prd_id: result.prd_id,
    total_requirements: result.total_requirements,
    matched_requirements: result.matched_requirements,
    coverage_score: result.coverage_score,
    gap_findings: result.gap_findings,
    false_positive_count: result.false_positive_count,
    corrective_sds_created: result.corrective_sds_created,
    analysis_metadata: result.analysis_metadata
  });

  if (error) {
    console.error(`  Failed to store gap analysis results: ${error.message}`);
  }
}

export { extractRequirements, analyzeDeliverables, detectGaps, classifyRootCauses, createCorrectiveSDs };
