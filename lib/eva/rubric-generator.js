/**
 * rubric-generator.js — Venture-aware rubric synthesis via LLM.
 *
 * SD-LEO-INFRA-VENTURE-RUBRIC-SEMANTIC-001 (FR-2).
 *
 * Generates evidence rubrics dynamically by prompting an LLM with each
 * vision/arch extracted_dimension and the venture target-path. Output is
 * validated by validateRubricStrict (FR-4) and constrained to the 6
 * deterministic check types (file_exists, code_pattern, anti_pattern,
 * export_exists, db_row_exists, file_count) so downstream runRubricChecks
 * operates unchanged.
 *
 * When no LLM client is available, throws explicitly (TR-6: refused-silent-
 * fallback — never silently revert to EHG rubrics for a venture).
 */

import { getLLMClient } from '../llm/client-factory.js';
import { parseJSON } from './utils/parse-json.js';
import {
  ALLOWED_CHECK_TYPES,
  validateRubricStrict,
} from '../../scripts/eva/evidence-rubrics/index.js';

const SYSTEM_PROMPT = `You are an evidence-rubric generator for the /heal vision scoring pipeline.
Given a venture dimension (vision or architecture), produce a binary-check rubric
in strict JSON. Each check must use one of EXACTLY these 6 types:
${ALLOWED_CHECK_TYPES.join(', ')}

Rules:
- Output a single JSON object — no prose, no markdown fences.
- Schema: {
    "id": "<dimId>",         // e.g. "V01" or "A03"
    "name": "<dim_name>",
    "checks": [
      {
        "id": "<dimId>-C1",
        "label": "<one-line human description>",
        "type": "<one of the 6 allowed types>",
        "weight": <number; the 3-5 check weights must sum to 100>,
        "params": {
          // For file_exists / code_pattern / anti_pattern / file_count: include "glob" (string)
          //   and for code_pattern / anti_pattern also include "pattern" (regex string).
          //   Optional: "minMatches" / "maxMatches" / "minCount" integer.
          // For export_exists: include "module" (relative path string, e.g. "src/foo.js")
          //   and "exportName" (string).
          // For db_row_exists: include "table" (string); optional "column" + "value" or "filter".
        }
      }
      // ...3 to 5 checks total. Weights MUST sum to 100.
    ]
  }
- "params" MUST contain at least one of: glob, pattern, module, table (a concrete
  reference into the venture codebase or database). Empty params objects will be REJECTED.
- Reference real files/exports/tables in the venture codebase (rooted at the targetPath
  the user provides). Do not invent paths that obviously cannot exist (e.g., do not
  reference "scripts/modules/auto-proceed/*" unless the venture actually has that path).
- Prefer file_exists / code_pattern over db_row_exists unless the dimension is genuinely
  database-defined.`;

function buildUserPrompt({ dimId, dim, targetPath, side }) {
  const name = dim.key || dim.name || dimId;
  const description = dim.description || dim.summary || '';
  return `Venture target codebase: ${targetPath}
Dimension side: ${side}  (vision dim → V## ids; architecture dim → A## ids)
Dimension id: ${dimId}
Dimension name: ${name}
Dimension description: ${description || '(none provided)'}
Dimension weight in overall score: ${dim.weight || 0}

Produce a JSON rubric (no markdown, no prose) that evaluates evidence FOR THIS
SPECIFIC DIMENSION in the venture codebase at the target path above. Use 3-5
binary checks whose weights sum to 100.`;
}

async function generateOneRubric({ dimId, dim, targetPath, side, llmClient, retries }) {
  let lastErr;
  const userPrompt = buildUserPrompt({ dimId, dim, targetPath, side });
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await llmClient.complete(SYSTEM_PROMPT, userPrompt);
    let parsed;
    try {
      parsed = parseJSON(response);
    } catch (err) {
      lastErr = err;
      continue;
    }
    parsed.id = parsed.id || dimId;
    parsed.name = parsed.name || (dim.key || dim.name || dimId);
    if (Array.isArray(parsed.checks)) {
      parsed.checks.forEach((c, i) => {
        c.id = c.id || `${dimId}-C${i + 1}`;
      });
    }
    try {
      validateRubricStrict(parsed, dimId);
      return parsed;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`generateVentureRubrics: failed to produce a valid rubric for ${dimId} after ${retries + 1} attempt(s) — ${lastErr?.message || 'unknown error'}`);
}

/**
 * Generate venture-aware rubrics for all vision + arch dimensions.
 *
 * @param {object} args
 * @param {object} args.vision - eva_vision_documents row with extracted_dimensions[]
 * @param {object} args.arch   - eva_architecture_plans row with extracted_dimensions[]
 * @param {string} args.targetPath - absolute path to the venture codebase
 * @param {object} [args.llmClient] - injected (for tests); when absent, fetched via getLLMClient
 * @param {number} [args.retries=1] - retry attempts per dimension on validation failure
 * @returns {Promise<{ rubrics: Map<string, object>, meta: { generator_model?: string, total_input_tokens?: number, total_output_tokens?: number } }>}
 */
export async function generateVentureRubrics({ vision, arch, targetPath, llmClient, retries = 1 }) {
  const client = llmClient ?? getLLMClient({ purpose: 'generation' });
  if (client.isInlineOnly) {
    throw new Error(
      'rubric-generator: no cloud LLM client available (client-factory cascade exhausted). ' +
      'Set ANTHROPIC_API_KEY / GEMINI_API_KEY / GOOGLE_AI_API_KEY, or pre-populate eva_vision_rubric_cache. ' +
      'REFUSING silent fallback to EHG rubrics (would produce misleading scores for ventures).'
    );
  }

  const rubrics = new Map();
  let totalInput = 0;
  let totalOutput = 0;
  const usedModel = client.model || client.adapter?.model;

  const visionDims = Array.isArray(vision?.extracted_dimensions) ? vision.extracted_dimensions : [];
  const archDims = Array.isArray(arch?.extracted_dimensions) ? arch.extracted_dimensions : [];

  for (let i = 0; i < visionDims.length; i++) {
    const dimId = `V${String(i + 1).padStart(2, '0')}`;
    const rubric = await generateOneRubric({
      dimId, dim: visionDims[i], targetPath, side: 'vision', llmClient: client, retries,
    });
    rubrics.set(dimId, rubric);
  }
  for (let i = 0; i < archDims.length; i++) {
    const dimId = `A${String(i + 1).padStart(2, '0')}`;
    const rubric = await generateOneRubric({
      dimId, dim: archDims[i], targetPath, side: 'arch', llmClient: client, retries,
    });
    rubrics.set(dimId, rubric);
  }

  return {
    rubrics,
    meta: {
      generator_model: usedModel,
      total_input_tokens: totalInput || undefined,
      total_output_tokens: totalOutput || undefined,
    },
  };
}
