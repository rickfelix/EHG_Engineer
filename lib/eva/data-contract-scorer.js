/**
 * Data Contract Completeness Scorer — V05 Dimension
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-04-B
 *
 * Analyzes stage contract definitions from stage-contracts.js,
 * validates YAML-JS parity, and scores per-stage completeness.
 *
 * @module lib/eva/data-contract-scorer
 */

const EXPECTED_STAGES = 25;
const REQUIRED_CONTRACT_FIELDS = ['type'];
const OPTIONAL_CONTRACT_FIELDS = ['required', 'minLength', 'min', 'max', 'minItems'];

/**
 * Score data contract completeness across all stages.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {Map} [options.stageContracts] - Override stage contracts for testing
 * @param {Object} [options.yamlContracts] - Override YAML contracts for testing
 * @returns {Promise<{ score: Object, stageDetails: Array, gaps: Array, error?: string }>}
 */
export async function scoreDataContracts(supabase, options = {}) {
  const { logger = console, stageContracts, yamlContracts } = options;

  if (!supabase) {
    return { score: emptyScore(), stageDetails: [], gaps: [], error: 'No supabase client' };
  }

  try {
    // Load stage contracts (injected or from module)
    let contracts = stageContracts;
    if (!contracts) {
      try {
        const mod = await import('./contracts/stage-contracts.js');
        contracts = mod.STAGE_CONTRACTS || mod.default;
      } catch {
        return { score: emptyScore(), stageDetails: [], gaps: [], error: 'Could not load stage contracts' };
      }
    }

    const stageDetails = [];
    const gaps = [];
    let totalFields = 0;
    let completeFields = 0;

    for (const [stageNum, contract] of contracts) {
      const produces = contract.produces || {};
      const consumes = contract.consumes || [];
      const fieldNames = Object.keys(produces);
      const stageFieldCount = fieldNames.length;

      let stageCompleteFields = 0;
      const stageGaps = [];

      for (const [fieldName, spec] of Object.entries(produces)) {
        if (!spec || typeof spec !== 'object') {
          stageGaps.push({ field: fieldName, issue: 'Invalid spec (not an object)' });
          continue;
        }

        if (!spec.type) {
          stageGaps.push({ field: fieldName, issue: 'Missing type definition' });
          continue;
        }

        // Count optional constraint coverage
        const hasConstraints = OPTIONAL_CONTRACT_FIELDS.some((f) => spec[f] != null);
        stageCompleteFields++;

        if (!hasConstraints && spec.type === 'string' && !spec.minLength) {
          stageGaps.push({ field: fieldName, issue: 'String field missing minLength constraint' });
        }
      }

      totalFields += stageFieldCount;
      completeFields += stageCompleteFields;

      const coverage = stageFieldCount > 0
        ? Math.round((stageCompleteFields / stageFieldCount) * 100)
        : 0;

      stageDetails.push({
        stage: stageNum,
        fieldCount: stageFieldCount,
        completeFields: stageCompleteFields,
        consumesCount: consumes.length,
        coveragePercent: coverage,
        gaps: stageGaps.length,
      });

      for (const gap of stageGaps) {
        gaps.push({ stage: stageNum, ...gap });
      }
    }

    // YAML parity check
    let yamlParity = null;
    if (yamlContracts) {
      yamlParity = checkYamlParity(contracts, yamlContracts);
    }

    const overallCoverage = totalFields > 0
      ? Math.round((completeFields / totalFields) * 100)
      : 0;

    const stageCoverage = Math.round((contracts.size / EXPECTED_STAGES) * 100);

    return {
      score: {
        overallCoverage,
        stageCoverage,
        totalStages: contracts.size,
        expectedStages: EXPECTED_STAGES,
        totalFields,
        completeFields,
        gapCount: gaps.length,
        yamlParity,
        generatedAt: new Date().toISOString(),
      },
      stageDetails,
      gaps,
    };
  } catch (err) {
    logger.warn(`[DataContractScorer] Error: ${err.message}`);
    return { score: emptyScore(), stageDetails: [], gaps: [], error: err.message };
  }
}

/**
 * Get contract coverage summary.
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getContractCoverageSummary(supabase, options = {}) {
  const result = await scoreDataContracts(supabase, options);
  if (result.error) {
    return { summary: { coveragePercent: 0, totalStages: 0, gapCount: 0 }, error: result.error };
  }

  return {
    summary: {
      coveragePercent: result.score.overallCoverage,
      stageCoverage: result.score.stageCoverage,
      totalStages: result.score.totalStages,
      totalFields: result.score.totalFields,
      gapCount: result.score.gapCount,
    },
  };
}

/**
 * Get scoring dimension info.
 * @returns {Object}
 */
export function getDimensionInfo() {
  return {
    dimension: 'V05',
    name: 'Data Contracts',
    description: 'Schema validation and type validation between modules',
    expectedStages: EXPECTED_STAGES,
    requiredFields: [...REQUIRED_CONTRACT_FIELDS],
    optionalFields: [...OPTIONAL_CONTRACT_FIELDS],
  };
}

// ── Internal Helpers ─────────────────────────────

function checkYamlParity(jsContracts, yamlContracts) {
  let matched = 0;
  let mismatched = 0;
  const diffs = [];

  for (const [stageNum] of jsContracts) {
    const yamlContract = yamlContracts[stageNum];
    if (yamlContract) {
      matched++;
    } else {
      mismatched++;
      diffs.push({ stage: stageNum, issue: 'Missing in YAML' });
    }
  }

  return {
    matched,
    mismatched,
    parityPercent: jsContracts.size > 0
      ? Math.round((matched / jsContracts.size) * 100)
      : 0,
    diffs,
  };
}

function emptyScore() {
  return {
    overallCoverage: 0,
    stageCoverage: 0,
    totalStages: 0,
    expectedStages: EXPECTED_STAGES,
    totalFields: 0,
    completeFields: 0,
    gapCount: 0,
    yamlParity: null,
    generatedAt: new Date().toISOString(),
  };
}
