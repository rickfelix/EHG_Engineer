import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../../../lib/eva/config/venture-default-capabilities.js';

const STAGE_13_PATH = resolve(
  process.cwd(),
  'lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
);

const stage13Source = readFileSync(STAGE_13_PATH, 'utf8');

describe('Stage 13 — default-capabilities exclusion (SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001)', () => {
  describe('Source structure', () => {
    it('imports EHG_VENTURE_DEFAULT_CAPABILITIES from config (no string-literal duplication)', () => {
      expect(stage13Source).toMatch(
        /import\s*\{\s*EHG_VENTURE_DEFAULT_CAPABILITIES\s*\}\s*from\s*['"][^'"]*venture-default-capabilities/
      );
    });

    it('SYSTEM_PROMPT contains the EXCLUDED constraint header', () => {
      expect(stage13Source).toMatch(
        /EXCLUDED \(EHG portfolio defaults/
      );
    });

    it('SYSTEM_PROMPT references SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001', () => {
      expect(stage13Source).toContain('SD-LEO-INFRA-S13-ROADMAP-DEFAULT-CAPABILITIES-CONSTRAINT-001');
    });

    it('renders all capability names and IDs into EXCLUDED_CAPABILITIES_BLOCK', () => {
      // Load the module and verify the rendered block contains each capability
      return import('../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js')
        .then(({ EXCLUDED_CAPABILITIES_BLOCK }) => {
          for (const cap of EHG_VENTURE_DEFAULT_CAPABILITIES) {
            expect(EXCLUDED_CAPABILITIES_BLOCK).toContain(cap.name);
            expect(EXCLUDED_CAPABILITIES_BLOCK).toContain(cap.capability_id);
          }
        });
    });
  });

  describe('excludeDefaultCapabilityMilestones()', () => {
    it('strips a milestone whose name matches the feedback-widget capability name (TS-1)', async () => {
      const { excludeDefaultCapabilityMilestones } = await import(
        '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
      );
      const feedbackCap = EHG_VENTURE_DEFAULT_CAPABILITIES.find(
        c => c.capability_id === 'feedback-widget'
      );
      const milestones = [
        { name: feedbackCap.name, date: '2026-07-01', deliverables: ['widget'], dependencies: [], priority: 'now' },
        { name: 'Build AI market-modeling engine', date: '2026-08-01', deliverables: ['engine'], dependencies: [], priority: 'next' },
      ];
      const result = excludeDefaultCapabilityMilestones(milestones);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Build AI market-modeling engine');
    });

    it('strips a milestone whose name matches the error-capture capability name (TS-2)', async () => {
      const { excludeDefaultCapabilityMilestones } = await import(
        '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
      );
      const errorCap = EHG_VENTURE_DEFAULT_CAPABILITIES.find(
        c => c.capability_id === 'error-capture-middleware'
      );
      const milestones = [
        { name: errorCap.name, date: '2026-07-01', deliverables: ['middleware'], dependencies: [], priority: 'now' },
        { name: 'Integrate Stripe billing', date: '2026-08-01', deliverables: ['billing'], dependencies: [], priority: 'next' },
      ];
      const result = excludeDefaultCapabilityMilestones(milestones);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Integrate Stripe billing');
    });

    it('preserves bespoke milestones with unrelated names (TS-3)', async () => {
      const { excludeDefaultCapabilityMilestones } = await import(
        '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
      );
      const milestones = [
        { name: 'Launch MVP', date: '2026-07-01', deliverables: ['mvp'], dependencies: [], priority: 'now' },
        { name: 'Integrate Stripe billing', date: '2026-08-01', deliverables: ['billing'], dependencies: [], priority: 'next' },
        { name: 'Build AI market-modeling engine', date: '2026-09-01', deliverables: ['engine'], dependencies: [], priority: 'later' },
      ];
      const result = excludeDefaultCapabilityMilestones(milestones);
      expect(result).toHaveLength(3);
    });

    it('strips milestone matching capability_id substring (TS-1 variant)', async () => {
      const { excludeDefaultCapabilityMilestones } = await import(
        '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
      );
      const milestones = [
        { name: 'feedback-widget integration', date: '2026-07-01', deliverables: ['x'], dependencies: [], priority: 'now' },
        { name: 'Unrelated milestone', date: '2026-08-01', deliverables: ['y'], dependencies: [], priority: 'next' },
      ];
      const result = excludeDefaultCapabilityMilestones(milestones);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Unrelated milestone');
    });

    it('handles empty milestones array gracefully', async () => {
      const { excludeDefaultCapabilityMilestones } = await import(
        '../../../lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap.js'
      );
      expect(excludeDefaultCapabilityMilestones([])).toEqual([]);
    });
  });
});
