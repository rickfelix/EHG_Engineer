/**
 * Unit tests for Exit Table Wiring (SD-LEO-INFRA-EXTEND-EXIT-TABLES-001, SD-A)
 *
 * Tests:
 * 1. EXIT_MODEL_MAP mapping logic — all 5 Stage 9 exit types map to valid table exit_model values
 * 2. Stage 13 property name fix — exit_paths is used (not strategies)
 *
 * @module tests/unit/eva/exit-table-wiring
 */

import { describe, it, expect } from 'vitest';
import { EXIT_TYPES, EXIT_MODEL_MAP } from '../../../lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy.js';

// Valid exit_model values from the venture_exit_profiles CHECK constraint
const VALID_EXIT_MODELS = ['full_acquisition', 'licensing', 'revenue_share', 'acqui_hire', 'asset_sale', 'merger'];

describe('EXIT_MODEL_MAP', () => {
  it('maps all 5 EXIT_TYPES to valid exit_model values', () => {
    for (const exitType of EXIT_TYPES) {
      const mapped = EXIT_MODEL_MAP[exitType];
      expect(mapped, `EXIT_MODEL_MAP['${exitType}'] should be defined`).toBeDefined();
      expect(VALID_EXIT_MODELS, `EXIT_MODEL_MAP['${exitType}'] = '${mapped}' should be in VALID_EXIT_MODELS`).toContain(mapped);
    }
  });

  it('maps acquisition to full_acquisition', () => {
    expect(EXIT_MODEL_MAP['acquisition']).toBe('full_acquisition');
  });

  it('maps ipo to full_acquisition', () => {
    expect(EXIT_MODEL_MAP['ipo']).toBe('full_acquisition');
  });

  it('maps merger to merger', () => {
    expect(EXIT_MODEL_MAP['merger']).toBe('merger');
  });

  it('maps mbo to full_acquisition', () => {
    expect(EXIT_MODEL_MAP['mbo']).toBe('full_acquisition');
  });

  it('maps liquidation to asset_sale', () => {
    expect(EXIT_MODEL_MAP['liquidation']).toBe('asset_sale');
  });

  it('returns undefined for unknown exit types (graceful degradation)', () => {
    expect(EXIT_MODEL_MAP['unknown_type']).toBeUndefined();
    expect(EXIT_MODEL_MAP['']).toBeUndefined();
    expect(EXIT_MODEL_MAP[null]).toBeUndefined();
  });

  it('has exactly 5 entries matching EXIT_TYPES', () => {
    expect(Object.keys(EXIT_MODEL_MAP)).toHaveLength(EXIT_TYPES.length);
    for (const key of Object.keys(EXIT_MODEL_MAP)) {
      expect(EXIT_TYPES).toContain(key);
    }
  });
});

describe('Stage 13 exit_paths property name fix', () => {
  it('reads exit_paths (not strategies) from stage9Data', async () => {
    // Dynamically import the module to read its source and verify
    // the property name used for stage 9 data consumption
    const modulePath = '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js';
    const moduleSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL(modulePath, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf-8'
      )
    );

    // The old (broken) code used stage9Data?.strategies
    expect(moduleSource).not.toContain('stage9Data?.strategies');
    expect(moduleSource).not.toContain("stage9Data?.strategies");

    // The fixed code uses stage9Data?.exit_paths
    expect(moduleSource).toContain('stage9Data?.exit_paths');
  });

  it('includes exit model in LLM prompt context when exit_paths present', async () => {
    const modulePath = '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js';
    const moduleSource = await import('node:fs').then(fs =>
      fs.readFileSync(
        new URL(modulePath, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'),
        'utf-8'
      )
    );

    // The prompt context should reference exit_model
    expect(moduleSource).toContain('exit model');
    // The prompt should reference the primary exit path type
    expect(moduleSource).toContain('exit_paths[0]?.type');
  });
});
