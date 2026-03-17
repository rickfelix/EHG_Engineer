/**
 * ACCEPTANCE_CRITERIA_TRACEABILITY — Orchestrator Completion Validation
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-B
 *
 * Parses the vision document's "Success Criteria" section and maps each
 * criterion to test files via keyword matching. Unmapped criteria block
 * orchestrator completion.
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const GATE_NAME = 'ACCEPTANCE_CRITERIA_TRACEABILITY';

/**
 * Extract numbered criteria from a vision document's Success Criteria section.
 * Handles formats like "1. Criterion text" or "- Criterion text"
 */
function extractSuccessCriteria(visionContent) {
  if (!visionContent) return [];

  // Find Success Criteria section (try multiple heading patterns)
  const patterns = [
    /##\s*Success\s*Criteria\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/i,
    /##\s*Key\s*Metrics\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/i,
    /##\s*Acceptance\s*Criteria\s*\n([\s\S]*?)(?=\n##\s|\n---|$)/i,
  ];

  let sectionContent = null;
  for (const pattern of patterns) {
    const match = visionContent.match(pattern);
    if (match) {
      sectionContent = match[1];
      break;
    }
  }

  if (!sectionContent) return [];

  // Extract numbered items (1. ...) or bullet items (- ...)
  const criteria = [];
  const lines = sectionContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match "1. text", "- text", "* text"
    const match = trimmed.match(/^(?:\d+\.\s+|[-*]\s+)(.+)/);
    if (match) {
      const text = match[1].trim();
      if (text.length > 5) {
        criteria.push(text);
      }
    }
  }

  return criteria;
}

/**
 * Extract key phrases from a criterion for matching against test files.
 * Strips common words and returns distinctive terms.
 */
function extractKeyPhrases(criterion) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'can', 'for', 'and', 'but',
    'or', 'not', 'no', 'nor', 'so', 'yet', 'both', 'either', 'neither',
    'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
    'some', 'such', 'than', 'too', 'very', 'just', 'also', 'that',
    'this', 'these', 'those', 'with', 'from', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
    'why', 'how', 'what', 'which', 'who', 'whom', 'its', 'their',
    'our', 'your', 'his', 'her', 'gate', 'test', 'tests', 'testing',
    'without', 'false', 'true', 'block', 'blocks', 'return', 'returns',
    'produces', 'generates', 'validates', 'correctly', 'accurately',
    'consistently', 'properly', 'successfully', 'expected', 'result',
    'ensure', 'verify', 'check', 'confirm', 'pass', 'fail', 'passed',
    'failed', 'passing', 'failing', 'run', 'runs', 'running', 'execute',
    'output', 'input', 'data', 'value', 'values', 'file', 'files',
  ]);

  return criterion
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Recursively find all test files in a directory.
 */
function findTestFiles(dir, files = []) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        findTestFiles(fullPath, files);
      } else if (entry.isFile() && /\.(test|spec)\.(js|mjs|cjs|ts)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch (e) {
    // Intentionally suppressed: Directory not accessible
    console.debug('[AcceptanceCriteriaTraceability] directory scan suppressed:', e?.message || e);
  }
  return files;
}

/**
 * Check if a test file content matches a criterion's key phrases.
 * Returns the matching phrases found.
 */
function matchCriterionToTestFile(keyPhrases, testContent) {
  const lowerContent = testContent.toLowerCase();
  const matches = keyPhrases.filter(phrase => lowerContent.includes(phrase));
  // Require at least 3 phrase matches (or 2 if criterion has ≤3 phrases)
  const threshold = Math.max(2, Math.min(3, Math.ceil(keyPhrases.length * 0.4)));
  return matches.length >= threshold ? matches : [];
}

/**
 * Create the acceptance criteria traceability gate.
 */
export function createAcceptanceCriteriaTraceabilityGate(supabase) {
  return {
    name: GATE_NAME,
    validator: async (ctx) => {
      console.log('\n📋 GATE: Acceptance Criteria Traceability');
      console.log('-'.repeat(50));

      const sdKey = ctx.sd?.sd_key || ctx.sdKey;
      const sdId = ctx.sd?.id || ctx.sdId;

      // 1. Fetch vision document
      let visionContent = null;
      try {
        // Try by sd_id first (may store sd_key or UUID)
        const { data } = await supabase
          .from('eva_vision_documents')
          .select('content, vision_key')
          .or(`sd_id.eq.${sdId},sd_id.eq.${sdKey}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (data) {
          visionContent = data.content;
          console.log(`   Vision doc: ${data.vision_key}`);
        }
      } catch (e) {
        // Intentionally suppressed: No vision doc found
        console.debug('[AcceptanceCriteriaTraceability] vision doc query suppressed:', e?.message || e);
      }

      // Also check metadata for vision_key
      if (!visionContent && ctx.sd?.metadata?.vision_key) {
        try {
          const { data } = await supabase
            .from('eva_vision_documents')
            .select('content, vision_key')
            .eq('vision_key', ctx.sd.metadata.vision_key)
            .single();
          if (data) {
            visionContent = data.content;
            console.log(`   Vision doc (via metadata): ${data.vision_key}`);
          }
        } catch (e) {
          // Intentionally suppressed: Vision doc not found via metadata
          console.debug('[AcceptanceCriteriaTraceability] vision metadata query suppressed:', e?.message || e);
        }
      }

      // No vision doc — advisory pass
      if (!visionContent) {
        console.log('   ℹ️  No vision document found — advisory pass');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['No vision document found — criteria traceability not verified'],
          details: { reason: 'no vision document' },
        };
      }

      // 2. Extract success criteria
      const criteria = extractSuccessCriteria(visionContent);
      if (criteria.length === 0) {
        console.log('   ℹ️  No Success Criteria section found in vision doc — advisory pass');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['Vision document has no Success Criteria section'],
          details: { reason: 'no success criteria section' },
        };
      }

      console.log(`   Found ${criteria.length} success criteria`);

      // 3. Find and read test files
      const projectRoot = process.cwd();
      const testFiles = findTestFiles(join(projectRoot, 'tests'));
      console.log(`   Found ${testFiles.length} test files`);

      // Build a cache of test file contents
      const testContentCache = new Map();
      for (const file of testFiles) {
        try {
          testContentCache.set(file, readFileSync(file, 'utf8'));
        } catch (e) {
          // Intentionally suppressed: Skip unreadable files
          console.debug('[AcceptanceCriteriaTraceability] test file read suppressed:', e?.message || e);
        }
      }

      // 4. Map each criterion to test files
      const mappingResults = [];
      for (let i = 0; i < criteria.length; i++) {
        const criterion = criteria[i];
        const keyPhrases = extractKeyPhrases(criterion);
        const matchedFiles = [];

        for (const [file, content] of testContentCache) {
          // Check for @criteria annotation
          if (content.includes(`@criteria ${i + 1}`) || content.includes(`@criterion ${i + 1}`)) {
            matchedFiles.push({ file: relative(projectRoot, file), method: 'annotation' });
            continue;
          }

          // Check for keyword matching
          const matches = matchCriterionToTestFile(keyPhrases, content);
          if (matches.length > 0) {
            matchedFiles.push({ file: relative(projectRoot, file), method: 'keyword', phrases: matches });
          }
        }

        mappingResults.push({
          index: i + 1,
          criterion: criterion.slice(0, 100),
          keyPhrases,
          mapped: matchedFiles.length > 0,
          testFiles: matchedFiles.map(f => f.file),
        });
      }

      // 5. Calculate score
      const mapped = mappingResults.filter(r => r.mapped).length;
      const total = mappingResults.length;
      const score = total > 0 ? Math.round((mapped / total) * 100) : 100;

      console.log(`   Mapping: ${mapped}/${total} criteria mapped to tests (${score}%)`);

      // Report unmapped criteria
      const unmapped = mappingResults.filter(r => !r.mapped);
      const issues = unmapped.map(r =>
        `Criterion #${r.index} not traced to any test: "${r.criterion}"`
      );

      if (unmapped.length > 0) {
        console.log(`   ❌ ${unmapped.length} unmapped criteria:`);
        for (const r of unmapped) {
          console.log(`      #${r.index}: "${r.criterion.slice(0, 60)}..."`);
        }
      } else {
        console.log('   ✅ All criteria mapped to test files');
      }

      return {
        passed: score >= 70,
        score,
        max_score: 100,
        issues: score < 70 ? issues : [],
        warnings: score >= 70 ? issues : [],
        details: {
          total_criteria: total,
          mapped_criteria: mapped,
          unmapped_criteria: unmapped.length,
          mapping_results: mappingResults,
        },
      };
    },
    required: false, // Advisory initially
  };
}
