import { describe, it, expect } from 'vitest';
import { classifyFinding, SSOT_GENERATED_SURFACES } from '../../lib/audits/stage-census/classify.mjs';

// TS-6: known SSOT-generated column -> generated-from-ssot.
// TS-8: a finding NOT covered by any SSOT regen script -> hand-written (the other branch of the
// binary classifier -- proves the classifier discriminates rather than defaulting to one label).
describe('classifyFinding', () => {
  it('labels venture_stages.stage_number as generated-from-ssot', () => {
    const result = classifyFinding({ table: 'venture_stages', column: 'stage_number' });
    expect(result.label).toBe('generated-from-ssot');
    expect(result.rationale).toMatch(/scripts\/generate-stage-config\.cjs/);
  });

  it('labels lifecycle_stage_config.stage_number as generated-from-ssot', () => {
    const result = classifyFinding({ table: 'lifecycle_stage_config', column: 'stage_number' });
    expect(result.label).toBe('generated-from-ssot');
  });

  it('labels a hardcoded application-code finding as hand-written (the other branch)', () => {
    const result = classifyFinding({ file: 'src/components/stages/admin/Stage22DistributionSetup.tsx' });
    expect(result.label).toBe('hand-written');
    expect(result.rationale).toMatch(/Stage22DistributionSetup\.tsx/);
  });

  it('labels a finding with neither table/column nor file as hand-written by default', () => {
    const result = classifyFinding({});
    expect(result.label).toBe('hand-written');
  });

  it('never classifies a surface not in the known SSOT list as generated-from-ssot', () => {
    const result = classifyFinding({ table: 'venture_stages', column: 'component_path' });
    expect(result.label).toBe('hand-written');
    expect(SSOT_GENERATED_SURFACES.some((s) => s.table === 'venture_stages' && s.column === 'component_path')).toBe(false);
  });
});
