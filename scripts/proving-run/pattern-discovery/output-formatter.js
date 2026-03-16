/**
 * Output Formatter — produces the final JSON output combining
 * stage reference maps and pattern templates.
 *
 * Part of: Pattern Discovery Agent (SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B)
 */

/**
 * Format the complete pattern discovery output.
 * @param {object} params
 * @param {Object.<number, object>} params.stageMap - From stage-mapper
 * @param {Object.<number, object>} params.gitHistory - From git-scanner
 * @param {Object.<number, object>} params.codebaseAnalysis - From codebase-analyzer
 * @param {object} params.patternClassification - From pattern-classifier
 * @param {number} params.durationMs - Total scan duration
 * @returns {PatternDiscoveryOutput}
 */
export function formatOutput({ stageMap, gitHistory, codebaseAnalysis, patternClassification, durationMs }) {
  const stageReferences = {};

  for (const [numStr, stage] of Object.entries(stageMap)) {
    const num = parseInt(numStr);
    const git = gitHistory[num] || { engineer: { commitCount: 0 }, app: { commitCount: 0 } };
    const analysis = codebaseAnalysis[num] || { coverage: {}, coveredDimensions: 0, coveragePercent: 0 };

    stageReferences[num] = {
      name: stage.name,
      phase: stage.phase,
      gateType: stage.gateType,
      workType: stage.workType,

      // Per-dimension file discovery
      dimensions: {
        code: {
          files: analysis.code?.found || [],
          fileCount: analysis.code?.count || 0,
          covered: analysis.coverage?.code || false,
        },
        db: {
          files: analysis.db?.found || [],
          fileCount: analysis.db?.count || 0,
          covered: analysis.coverage?.db || false,
        },
        service: {
          files: analysis.service?.found || [],
          fileCount: analysis.service?.count || 0,
          covered: analysis.coverage?.service || false,
        },
        tests: {
          files: analysis.tests?.found || [],
          fileCount: analysis.tests?.count || 0,
          covered: analysis.coverage?.tests || false,
        },
        artifacts: {
          required: stage.requiredArtifacts,
          covered: analysis.coverage?.artifacts || false,
        },
      },

      // Coverage summary
      coverage: {
        coveredDimensions: analysis.coveredDimensions,
        totalDimensions: 5,
        percent: analysis.coveragePercent,
      },

      // Git activity
      gitActivity: {
        engineer: {
          recentCommits: git.engineer?.commitCount || 0,
          patterns: git.engineer?.patterns || {},
        },
        app: {
          recentCommits: git.app?.commitCount || 0,
          patterns: git.app?.patterns || {},
        },
      },

      // Wiring connections to adjacent stages
      adjacentStages: {
        previous: num > 1 ? num - 1 : null,
        next: num < 17 ? num + 1 : null,
      },
    };
  }

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    durationMs,
    maxStage: 17,

    // Output 1: Per-stage reference maps
    stageReferences,

    // Output 2: Pattern templates by category
    patternTemplates: patternClassification.templates,

    // Coverage matrix: category x stage
    coverageMatrix: patternClassification.coverageMatrix,

    // Summary statistics
    summary: {
      stagesScanned: Object.keys(stageReferences).length,
      patternCategories: patternClassification.summary.activeCategories,
      totalReferenceFiles: patternClassification.summary.totalReferenceFiles,
      averageCoverage: calculateAverageCoverage(stageReferences),
      gateStages: {
        kill: Object.values(stageReferences).filter(s => s.gateType === 'kill').map((_, i) => i + 1),
        promotion: Object.values(stageReferences).filter(s => s.gateType === 'promotion').map((_, i) => i + 1),
      },
    },
  };
}

/**
 * Calculate average coverage across all stages.
 */
function calculateAverageCoverage(stageRefs) {
  const coverages = Object.values(stageRefs).map(s => s.coverage.percent);
  if (coverages.length === 0) return 0;
  return Math.round(coverages.reduce((a, b) => a + b, 0) / coverages.length);
}
