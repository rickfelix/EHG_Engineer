import { describe, it, expect, vi } from 'vitest';
import { validateWireframeArtifact } from '../../../../scripts/modules/handoff/validators/wireframe-artifact-validator.js';

// Mock the sd-type-applicability-policy module
vi.mock('../../../../scripts/modules/handoff/validation/sd-type-applicability-policy.js', () => ({
  RequirementLevel: {
    REQUIRED: 'REQUIRED',
    NON_APPLICABLE: 'NON_APPLICABLE',
    OPTIONAL: 'OPTIONAL'
  },
  getValidatorRequirement: vi.fn((sdType, _category) => {
    const nonApplicable = ['infrastructure', 'documentation', 'refactor', 'bugfix'];
    const optional = ['enhancement', 'implementation'];
    if (nonApplicable.includes(sdType)) return 'NON_APPLICABLE';
    if (optional.includes(sdType)) return 'OPTIONAL';
    return 'REQUIRED';
  }),
  createSkippedResult: vi.fn((validatorName, sdType) => ({
    passed: true,
    status: 'SKIPPED',
    score: 100,
    max_score: 100,
    issues: [],
    warnings: [],
    skipped: true,
    skipReason: 'NON_APPLICABLE_SD_TYPE',
    skipDetails: { validator_name: validatorName, sd_type: sdType }
  }))
}));

describe('validateWireframeArtifact', () => {
  it('returns skipped result for non-applicable SD types', async () => {
    const result = await validateWireframeArtifact({
      prd: {},
      sd: { sd_type: 'infrastructure' }
    });
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.score).toBe(100);
  });

  it('returns score 100 when no UI indicators detected', async () => {
    const result = await validateWireframeArtifact({
      prd: { executive_summary: 'Database migration for schema updates.' },
      sd: { sd_type: 'feature', title: 'DB schema update' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings[0]).toContain('No UI indicators detected');
    expect(result.details.reason).toBe('no_ui_indicators');
  });

  it('fails for required SD type with UI work but no wireframes', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Build a dashboard component with charts and layout panels.',
        functional_requirements: ['Create sidebar navigation', 'Add responsive layout']
      },
      sd: { sd_type: 'feature', title: 'New Dashboard Feature' }
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('wireframe specifications');
    expect(result.details.ui_detected).toBe(true);
    expect(result.details.wireframes_found).toBe(false);
  });

  it('returns score 70 for optional SD type with UI work but no wireframes', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Enhance the dashboard layout with new chart components and panels.',
        functional_requirements: ['Update sidebar navigation']
      },
      sd: { sd_type: 'enhancement', title: 'Dashboard Enhancement' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(70);
    expect(result.warnings[0]).toContain('Consider adding wireframes');
    expect(result.details.requirement).toBe('OPTIONAL');
  });

  it('returns score 100 when wireframe references found in ui_ux_requirements', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Build dashboard component with layout and sidebar panels.',
        ui_ux_requirements: { wireframe: 'ASCII wireframe showing the main dashboard layout' },
        functional_requirements: ['Create navigation menu']
      },
      sd: { sd_type: 'feature', title: 'Dashboard' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.wireframes_found).toBe(true);
    expect(result.details.found_in).toContain('ui_ux_requirements');
  });

  it('returns score 100 when wireframe references found in executive_summary', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Implemented per the wireframe specifications for the dashboard component and layout.',
        functional_requirements: ['Build navigation sidebar']
      },
      sd: { sd_type: 'feature', title: 'New UI' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.found_in).toContain('executive_summary');
  });

  it('detects mockup references', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Built the component dashboard with layout changes per mockup.',
        functional_requirements: ['Create sidebar panel']
      },
      sd: { sd_type: 'feature' }
    });
    expect(result.score).toBe(100);
    expect(result.details.wireframes_found).toBe(true);
  });

  it('detects figma references', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Dashboard component with layout panels based on Figma designs.',
        functional_requirements: ['Build responsive sidebar']
      },
      sd: { sd_type: 'feature' }
    });
    expect(result.score).toBe(100);
    expect(result.details.wireframes_found).toBe(true);
  });

  it('detects UI work from ui_ux_requirements object', async () => {
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Simple backend change.',
        ui_ux_requirements: { components: ['button', 'form'] }
      },
      sd: { sd_type: 'feature' }
    });
    // ui_ux_requirements non-empty = UI detected, but no wireframe references
    expect(result.passed).toBe(false);
    expect(result.details.ui_detected).toBe(true);
  });

  it('requires at least 2 UI keyword matches to detect UI work', async () => {
    // Only 1 keyword match should not trigger UI detection
    const result = await validateWireframeArtifact({
      prd: {
        executive_summary: 'Added a new button to the API response handler.',
        functional_requirements: []
      },
      sd: { sd_type: 'feature', title: 'API enhancement' }
    });
    // Only "button" matches - needs 2+
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.reason).toBe('no_ui_indicators');
  });
});
