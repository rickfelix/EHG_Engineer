import { describe, it, expect } from 'vitest';
import {
  validateVentureDefaultCapabilities,
  MissingDefaultCapabilityError,
} from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

const happySprintPlan = {
  sprintItems: [
    { title: 'Build core ventureHealth dashboard', priority: 'high' },
    { title: 'Integrate Feedback Widget', priority: 'high' },
    { title: 'Wire Error Capture Middleware', priority: 'high' },
  ],
};

const missingFeedbackPlan = {
  sprintItems: [
    { title: 'Build core ventureHealth dashboard', priority: 'high' },
    { title: 'Wire Error Capture Middleware', priority: 'high' },
  ],
};

const missingBothPlan = {
  sprintItems: [
    { title: 'Build core ventureHealth dashboard', priority: 'high' },
    { title: 'Add user profile page', priority: 'medium' },
  ],
};

describe('validateVentureDefaultCapabilities', () => {
  describe('TS-1 — happy path', () => {
    it('returns valid:true with no errors/warnings when both capabilities present', () => {
      const result = validateVentureDefaultCapabilities(happySprintPlan, { defaultCapabilitiesOverride: {} });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('matches sprint items via case-insensitive title-prefix', () => {
      const plan = {
        sprintItems: [
          { title: 'integrate feedback widget into header' },
          { title: 'wire error capture middleware (Sentry)' },
        ],
      };
      const result = validateVentureDefaultCapabilities(plan, {});
      expect(result.valid).toBe(true);
    });

    it('matches sprint items via capability_id substring', () => {
      const plan = {
        sprintItems: [
          { title: 'Story XYZ — feedback-widget rollout' },
          { title: 'Setup error-capture-middleware' },
        ],
      };
      const result = validateVentureDefaultCapabilities(plan, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('TS-2 — missing without override', () => {
    it('returns valid:false with feedback-widget error', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, { defaultCapabilitiesOverride: {} });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/feedback-widget/);
      expect(result.errors[0]).toMatch(/no override_reason provided/);
      expect(result.warnings).toEqual([]);
    });

    it('returns valid:false with BOTH capability errors when both missing', () => {
      const result = validateVentureDefaultCapabilities(missingBothPlan, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toMatch(/feedback-widget/);
      expect(result.errors[1]).toMatch(/error-capture-middleware/);
    });
  });

  describe('TS-3 — missing with valid override', () => {
    it('returns valid:true with warning when override_reason is non-empty trimmed string', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, {
        defaultCapabilitiesOverride: {
          'feedback-widget': { override_reason: 'B2B-only venture, no end-user UI' },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/feedback-widget intentionally omitted/);
      expect(result.warnings[0]).toMatch(/B2B-only venture/);
    });

    it('handles overrides for both capabilities independently', () => {
      const result = validateVentureDefaultCapabilities(missingBothPlan, {
        defaultCapabilitiesOverride: {
          'feedback-widget': { override_reason: 'B2B-only' },
          'error-capture-middleware': { override_reason: 'Backend-only data pipeline, no runtime errors to capture' },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    });
  });

  describe('TS-5 — fail-closed: malformed override does NOT bypass', () => {
    it('rejects null override_reason', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, {
        defaultCapabilitiesOverride: { 'feedback-widget': { override_reason: null } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/empty or malformed/);
    });

    it('rejects empty-string override_reason', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, {
        defaultCapabilitiesOverride: { 'feedback-widget': { override_reason: '' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/empty or malformed/);
    });

    it('rejects whitespace-only override_reason', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, {
        defaultCapabilitiesOverride: { 'feedback-widget': { override_reason: '   \t\n  ' } },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/empty or malformed/);
    });

    it('rejects undefined override_reason (override key present but no reason field)', () => {
      const result = validateVentureDefaultCapabilities(missingFeedbackPlan, {
        defaultCapabilitiesOverride: { 'feedback-widget': {} },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/empty or malformed/);
    });
  });

  describe('edge cases', () => {
    it('returns valid:false when parsed input is null', () => {
      const result = validateVentureDefaultCapabilities(null, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/null or not an object/);
    });

    it('handles plan using `items` key instead of `sprintItems`', () => {
      const plan = {
        items: [
          { title: 'Integrate Feedback Widget' },
          { title: 'Wire Error Capture Middleware' },
        ],
      };
      const result = validateVentureDefaultCapabilities(plan, {});
      expect(result.valid).toBe(true);
    });

    it('treats missing sprintItems as empty array (both capabilities will fail)', () => {
      const result = validateVentureDefaultCapabilities({}, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});

describe('MissingDefaultCapabilityError', () => {
  it('has name=MissingDefaultCapabilityError and code=MISSING_DEFAULT_CAPABILITY', () => {
    const err = new MissingDefaultCapabilityError('test', ['e1', 'e2']);
    expect(err.name).toBe('MissingDefaultCapabilityError');
    expect(err.code).toBe('MISSING_DEFAULT_CAPABILITY');
    expect(err.errors).toEqual(['e1', 'e2']);
    expect(err instanceof Error).toBe(true);
  });
});
