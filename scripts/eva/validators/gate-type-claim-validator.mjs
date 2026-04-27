/**
 * GateTypeClaimValidator — verifies a brainstorm-cited stage gateType against
 * ehg/src/config/venture-workflow.ts (single source of truth).
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-2)
 *
 * Claim shape:
 *   { type: 'gate_type', stage_number: 22, expected_gate: 'kill' | 'promotion' | 'none' [, source_repo: 'ehg'] }
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';

export const VALIDATOR_ID = 'gate-type-claim-validator';

const VALID_GATE_TYPES = new Set(['none', 'kill', 'promotion']);

const STAGE_BLOCK_RE =
  /\{[^{}]*?stageNumber:\s*(\d+)[^{}]*?stageName:\s*['"]([^'"]+)['"][^{}]*?gateType:\s*['"](none|kill|promotion)['"][^{}]*?\}/gs;

export function defaultSourcePath(claim, context = {}) {
  if (claim?.source_path) return claim.source_path;
  if (context?.venture_workflow_path) return context.venture_workflow_path;
  const repo = claim?.source_repo || context.source_repo || 'ehg';
  const baseRoot = context.ehg_root || resolve(process.cwd(), '..', repo);
  return resolve(baseRoot, 'src', 'config', 'venture-workflow.ts');
}

export function parseStages(content) {
  const stages = [];
  STAGE_BLOCK_RE.lastIndex = 0;
  let match;
  while ((match = STAGE_BLOCK_RE.exec(content)) !== null) {
    const [, num, name, gate] = match;
    stages.push({
      stageNumber: Number(num),
      stageName: name,
      gateType: gate,
      offset: match.index,
    });
  }
  return stages;
}

export async function validate(claim, context = {}) {
  if (typeof claim?.stage_number !== 'number' || !VALID_GATE_TYPES.has(claim?.expected_gate)) {
    return {
      passed: false,
      expected: 'claim with stage_number:int and expected_gate ∈ {none, kill, promotion}',
      observed: JSON.stringify({ stage_number: claim?.stage_number, expected_gate: claim?.expected_gate }),
      source_path: null,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Fix claim shape; brainstorm assertion likely malformed.',
      validator_id: VALIDATOR_ID,
    };
  }

  const sourcePath = defaultSourcePath(claim, context);
  let content;
  try {
    content = await readFile(sourcePath, 'utf-8');
  } catch (err) {
    return {
      passed: false,
      expected: `readable file at ${sourcePath}`,
      observed: `read error: ${err.code || err.message}`,
      source_path: sourcePath,
      line_number: null,
      severity: 'error',
      remediation_hint:
        'Confirm venture-workflow.ts location. Override via context.venture_workflow_path or claim.source_path.',
      validator_id: VALIDATOR_ID,
    };
  }

  const stages = parseStages(content);
  const stage = stages.find((s) => s.stageNumber === claim.stage_number);

  if (!stage) {
    return {
      passed: false,
      expected: `stage block for stageNumber:${claim.stage_number}`,
      observed: `no stage block matched in ${sourcePath} (parsed ${stages.length} stages)`,
      source_path: sourcePath,
      line_number: null,
      severity: 'error',
      remediation_hint: 'Check whether stage_number is in the canonical 1-26 range; brainstorm may reference renamed stage.',
      validator_id: VALIDATOR_ID,
    };
  }

  const lineNumber = content.slice(0, stage.offset).split('\n').length;
  const passed = stage.gateType === claim.expected_gate;

  return {
    passed,
    expected: `Stage ${claim.stage_number} (${stage.stageName}) gateType='${claim.expected_gate}'`,
    observed: `Stage ${claim.stage_number} (${stage.stageName}) gateType='${stage.gateType}'`,
    source_path: sourcePath,
    line_number: lineNumber,
    severity: passed ? 'info' : 'error',
    remediation_hint: passed
      ? null
      : `Brainstorm claim is wrong. Either (a) update brainstorm to reflect actual gateType='${stage.gateType}', or (b) change venture-workflow.ts (with proper SD) to make Stage ${claim.stage_number} actually be a '${claim.expected_gate}' gate.`,
    validator_id: VALIDATOR_ID,
  };
}

export default { VALIDATOR_ID, validate, parseStages };
