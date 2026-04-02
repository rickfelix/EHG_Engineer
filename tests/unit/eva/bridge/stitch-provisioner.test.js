/**
 * Unit tests for Stitch Provisioner
 * SD-LEO-INFRA-GOOGLE-STITCH-DESIGN-001-B
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase
const mockSingle = vi.fn();
const mockLimit = vi.fn(() => ({ single: mockSingle }));
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockEq2 = vi.fn(() => ({ order: mockOrder, single: mockSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2, order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq1, limit: mockLimit }));
const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
  update: mockUpdate,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));
vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

// Mock stitch client
const mockStitchClient = {
  createProject: vi.fn(),
  generateScreens: vi.fn(),
};

const {
  provisionStitchProject,
  postStage15Hook,
  extractStage11Tokens,
  extractStage15Screens,
  buildScreenPrompt,
  checkGovernanceFlags,
  setStitchClientLoader,
} = await import('../../../../lib/eva/bridge/stitch-provisioner.js');

describe('stitch-provisioner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setStitchClientLoader(async () => mockStitchClient);

    // Default: governance enabled
    mockSingle.mockResolvedValue({
      data: {
        taste_gate_config: {
          stitch_enabled: true,
          stitch_auto_provision: true,
        },
      },
      error: null,
    });
  });

  // -----------------------------------------------------------------------
  // extractStage11Tokens
  // -----------------------------------------------------------------------
  describe('extractStage11Tokens', () => {
    it('extracts colorPalette, typography, brandExpression', () => {
      const tokens = extractStage11Tokens({
        colorPalette: ['#FF0000', '#00FF00'],
        typography: ['Inter', 'Roboto'],
        brandExpression: 'Modern, clean, professional',
      });

      expect(tokens.colors).toEqual(['#FF0000', '#00FF00']);
      expect(tokens.fonts).toEqual(['Inter', 'Roboto']);
      expect(tokens.personality).toBe('Modern, clean, professional');
    });

    it('handles visual_identity nested format', () => {
      const tokens = extractStage11Tokens({
        visual_identity: {
          color_palette: ['#123456'],
          typography: 'Poppins',
          brand_personality: 'Bold',
        },
      });

      expect(tokens.colors).toEqual(['#123456']);
      expect(tokens.fonts).toEqual(['Poppins']);
      expect(tokens.personality).toBe('Bold');
    });

    it('handles missing fields gracefully', () => {
      const tokens = extractStage11Tokens({});
      expect(tokens.colors).toBeUndefined();
      expect(tokens.fonts).toBeUndefined();
      expect(tokens.personality).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // extractStage15Screens
  // -----------------------------------------------------------------------
  describe('extractStage15Screens', () => {
    it('extracts screens array directly', () => {
      const screens = extractStage15Screens({
        screens: [
          { name: 'Home', purpose: 'Landing page', key_components: ['hero', 'nav'] },
        ],
      });
      expect(screens).toHaveLength(1);
      expect(screens[0].name).toBe('Home');
    });

    it('extracts from wireframes.screens', () => {
      const screens = extractStage15Screens({
        wireframes: { screens: [{ name: 'Dashboard' }] },
      });
      expect(screens).toHaveLength(1);
    });

    it('falls back to navigation_flows', () => {
      const screens = extractStage15Screens({
        navigation_flows: [{ name: 'Login', purpose: 'Auth', components: ['form'] }],
      });
      expect(screens).toHaveLength(1);
      expect(screens[0].key_components).toEqual(['form']);
    });

    it('returns empty array when no screens found', () => {
      expect(extractStage15Screens({})).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // buildScreenPrompt
  // -----------------------------------------------------------------------
  describe('buildScreenPrompt', () => {
    it('includes brand tokens and screen context', () => {
      const prompt = buildScreenPrompt(
        { name: 'Dashboard', purpose: 'Analytics overview', key_components: ['charts', 'KPIs'] },
        { colors: ['#FF0000'], fonts: ['Inter'], personality: 'Professional' },
        'TestApp'
      );

      expect(prompt).toContain('Dashboard');
      expect(prompt).toContain('TestApp');
      expect(prompt).toContain('#FF0000');
      expect(prompt).toContain('Inter');
      expect(prompt).toContain('Professional');
      expect(prompt).toContain('charts, KPIs');
    });
  });

  // -----------------------------------------------------------------------
  // Governance checks
  // -----------------------------------------------------------------------
  describe('governance', () => {
    it('returns no_op when stitch_enabled=false', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { taste_gate_config: { stitch_enabled: false, stitch_auto_provision: true } },
        error: null,
      });

      const result = await provisionStitchProject('v1', {}, { screens: [{ name: 'Home' }] });

      expect(result.status).toBe('no_op');
      expect(result.reason).toBe('stitch_disabled');
      expect(mockStitchClient.createProject).not.toHaveBeenCalled();
    });

    it('returns no_op when stitch_auto_provision=false', async () => {
      mockSingle.mockResolvedValueOnce({
        data: { taste_gate_config: { stitch_enabled: true, stitch_auto_provision: false } },
        error: null,
      });

      const result = await provisionStitchProject('v1', {}, { screens: [{ name: 'Home' }] });

      expect(result.status).toBe('no_op');
      expect(result.reason).toBe('auto_provision_disabled');
    });
  });

  // -----------------------------------------------------------------------
  // provisionStitchProject
  // -----------------------------------------------------------------------
  describe('provisionStitchProject (hybrid flow)', () => {
    it('creates project and saves curation prompts without generating screens', async () => {
      mockStitchClient.createProject.mockResolvedValue({
        project_id: 'proj-789',
        url: 'https://stitch.withgoogle.com/project/proj-789',
      });

      const result = await provisionStitchProject(
        'venture-123',
        { colorPalette: ['#FF0000'], typography: ['Inter'], brandExpression: 'Modern' },
        { screens: [{ name: 'Home', purpose: 'Landing' }, { name: 'About', purpose: 'Info' }] },
        { ventureName: 'TestApp' }
      );

      expect(result.status).toBe('awaiting_curation');
      expect(result.project_id).toBe('proj-789');
      expect(result.curation_prompts).toHaveLength(2);
      expect(mockStitchClient.createProject).toHaveBeenCalledOnce();
      // Should NOT call generateScreens (hybrid flow)
      expect(mockStitchClient.generateScreens).not.toHaveBeenCalled();
      expect(mockUpsert).toHaveBeenCalled(); // artifacts stored
    });

    it('returns no_op when no screens in artifacts', async () => {
      const result = await provisionStitchProject('v1', {}, {});

      expect(result.status).toBe('no_op');
      expect(result.reason).toBe('no_screens');
    });
  });

  // -----------------------------------------------------------------------
  // postStage15Hook
  // -----------------------------------------------------------------------
  describe('postStage15Hook', () => {
    it('catches errors without blocking', async () => {
      // Mock the ventures query + stage 11 query + governance query chain
      // The hook queries ventures, then venture_stage_work, then governance
      // On first call (ventures), return name. Mock chain will fail on stitch call.
      mockStitchClient.createProject.mockRejectedValue(new Error('API down'));

      const result = await postStage15Hook('v1', {
        screens: [{ name: 'Home' }],
      });

      expect(result.status).toBe('error');
      // Error may come from mock chain or from API — either way, non-blocking
      expect(result.error).toBeTruthy();
    });
  });
});
