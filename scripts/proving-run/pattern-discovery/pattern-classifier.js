/**
 * Pattern Classifier — categorizes discovered patterns into types
 * and builds a stage coverage matrix.
 *
 * Pattern Categories (from brainstorm design doc):
 * - structured_storage: DB tables + mapper services for stage data
 * - rls_policy: Row-level security patterns on stage tables
 * - mapper_service: Service scripts that wire stage output to storage
 * - quality_scoring: Scoring/validation logic per stage
 * - test_harness: Test infrastructure for stage components
 *
 * Part of: Pattern Discovery Agent (SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B)
 */

const PATTERN_CATEGORIES = {
  structured_storage: {
    name: 'Structured Storage Wiring',
    description: 'DB tables and schema for storing stage output data',
    fileIndicators: ['migration', 'schema', 'table', 'create_table'],
    pathIndicators: ['database/migrations', 'supabase/migrations'],
  },
  rls_policy: {
    name: 'RLS Policy',
    description: 'Row-level security policies on stage-related tables',
    fileIndicators: ['rls', 'policy', 'enable_rls', 'row_level'],
    pathIndicators: ['database/migrations'],
  },
  mapper_service: {
    name: 'Mapper Service',
    description: 'Service scripts that transform and wire stage output to storage',
    fileIndicators: ['mapper', 'transform', 'persist', 'capture', 'wire'],
    pathIndicators: ['scripts/', 'lib/', 'services/'],
  },
  quality_scoring: {
    name: 'Quality Scoring',
    description: 'Validation and scoring logic for stage gates',
    fileIndicators: ['score', 'validate', 'gate', 'assess', 'evaluate', 'quality'],
    pathIndicators: ['scripts/', 'lib/', 'validators/'],
  },
  test_harness: {
    name: 'Test Harness',
    description: 'Test infrastructure for stage components and services',
    fileIndicators: ['test', 'spec', 'fixture', 'mock'],
    pathIndicators: ['tests/', '__tests__/', 'test/'],
  },
};

/**
 * Classify files into pattern categories.
 * @param {Array<{relativePath: string}>} files
 * @returns {Object.<string, string[]>} Category -> file paths
 */
function classifyFiles(files) {
  const classified = {};
  for (const cat of Object.keys(PATTERN_CATEGORIES)) {
    classified[cat] = [];
  }

  for (const file of files) {
    const fp = file.relativePath?.toLowerCase() || '';

    for (const [catKey, catDef] of Object.entries(PATTERN_CATEGORIES)) {
      const matchesFile = catDef.fileIndicators.some(ind => fp.includes(ind));
      const matchesPath = catDef.pathIndicators.some(ind => fp.includes(ind.toLowerCase()));

      if (matchesFile || matchesPath) {
        classified[catKey].push(file.relativePath);
      }
    }
  }

  return classified;
}

/**
 * Build pattern templates from classified files.
 * Each template includes the reference implementation path and a code snippet hint.
 * @param {Object.<string, string[]>} classifiedFiles - Category -> file paths
 * @returns {Array<PatternTemplate>}
 */
function buildTemplates(classifiedFiles) {
  const templates = [];

  for (const [catKey, files] of Object.entries(classifiedFiles)) {
    if (files.length === 0) continue;

    const catDef = PATTERN_CATEGORIES[catKey];
    templates.push({
      category: catKey,
      name: catDef.name,
      description: catDef.description,
      referenceFiles: files.slice(0, 5), // Top 5 reference files
      fileCount: files.length,
      // Snippet hints based on category
      codeHint: getCodeHint(catKey),
    });
  }

  return templates;
}

/**
 * Get a code pattern hint for a category.
 */
function getCodeHint(category) {
  const hints = {
    structured_storage: 'CREATE TABLE stage_N_data (...); -- with venture_id FK and timestamps',
    rls_policy: 'ALTER TABLE stage_N_data ENABLE ROW LEVEL SECURITY; CREATE POLICY ...',
    mapper_service: 'export async function persistStageNOutput(ventureId, data) { ... }',
    quality_scoring: 'export function scoreStageN(planned, actual) { return { score, gaps }; }',
    test_harness: 'describe("Stage N", () => { it("should produce expected output", ...) })',
  };
  return hints[category] || '';
}

/**
 * Build the stage coverage matrix: which stages have which patterns.
 * @param {Object.<number, object>} stageAnalysis - From codebase-analyzer
 * @param {Array<PatternTemplate>} templates
 * @returns {Object.<string, Object.<number, boolean>>} Category -> { stageNum: hasPattern }
 */
function buildCoverageMatrix(stageAnalysis, templates) {
  const matrix = {};

  for (const template of templates) {
    matrix[template.category] = {};

    for (const stageNum of Object.keys(stageAnalysis)) {
      const num = parseInt(stageNum);
      const analysis = stageAnalysis[num];
      if (!analysis) {
        matrix[template.category][num] = false;
        continue;
      }

      // Check if this stage has files matching this pattern category
      const allFiles = [
        ...(analysis.code?.found || []),
        ...(analysis.db?.found || []),
        ...(analysis.service?.found || []),
        ...(analysis.tests?.found || []),
      ];

      const catDef = PATTERN_CATEGORIES[template.category];
      const hasPattern = allFiles.some(f => {
        const fl = f.toLowerCase();
        return catDef.fileIndicators.some(ind => fl.includes(ind)) ||
               catDef.pathIndicators.some(ind => fl.includes(ind.toLowerCase()));
      });

      matrix[template.category][num] = hasPattern;
    }
  }

  return matrix;
}

/**
 * Run full pattern classification pipeline.
 * @param {Object.<number, object>} stageAnalysis - From codebase-analyzer
 * @param {Array<{relativePath: string}>} allFiles - All discovered files
 * @returns {{ templates: Array, coverageMatrix: Object, categories: Object }}
 */
export function classifyPatterns(stageAnalysis, allFiles) {
  const classifiedFiles = classifyFiles(allFiles);
  const templates = buildTemplates(classifiedFiles);
  const coverageMatrix = buildCoverageMatrix(stageAnalysis, templates);

  return {
    templates,
    coverageMatrix,
    categories: PATTERN_CATEGORIES,
    summary: {
      totalCategories: Object.keys(PATTERN_CATEGORIES).length,
      activeCategories: templates.length,
      totalReferenceFiles: templates.reduce((sum, t) => sum + t.fileCount, 0),
    },
  };
}
