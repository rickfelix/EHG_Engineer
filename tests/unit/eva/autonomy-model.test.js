import { describe, it, expect, vi } from 'vitest';
import {
  AUTONOMY_LEVELS,
  LEVEL_ORDER,
  GATE_BEHAVIOR_MATRIX,
  checkAutonomy,
  getAutonomyOverride,
  autonomyPreCheck,
  validateLevelTransition,
  MODULE_VERSION,
} from '../../../lib/eva/autonomy-model.js';

describe('autonomy-model', () => {
  describe('AUTONOMY_LEVELS', () => {
    it('defines all 5 levels L0-L4', () => {
      expect(Object.keys(AUTONOMY_LEVELS)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    });

    it('each level has level, name, description', () => {
      for (const [key, val] of Object.entries(AUTONOMY_LEVELS)) {
        expect(val.level).toBe(key);
        expect(val.name).toBeTruthy();
        expect(val.description).toBeTruthy();
      }
    });
  });

  describe('LEVEL_ORDER', () => {
    it('has 5 levels in ascending order', () => {
      expect(LEVEL_ORDER).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    });
  });

  describe('GATE_BEHAVIOR_MATRIX', () => {
    it('L0 is all manual', () => {
      expect(GATE_BEHAVIOR_MATRIX.L0).toEqual({
        stage_gate: 'manual',
        reality_gate: 'manual',
        devils_advocate: 'manual',
      });
    });

    it('L1 auto-approves stage gates but not reality gates', () => {
      expect(GATE_BEHAVIOR_MATRIX.L1.stage_gate).toBe('auto_approve');
      expect(GATE_BEHAVIOR_MATRIX.L1.reality_gate).toBe('manual');
    });

    it('L4 auto-approves all gates and skips DA', () => {
      expect(GATE_BEHAVIOR_MATRIX.L4.stage_gate).toBe('auto_approve');
      expect(GATE_BEHAVIOR_MATRIX.L4.reality_gate).toBe('auto_approve');
      expect(GATE_BEHAVIOR_MATRIX.L4.devils_advocate).toBe('skip');
    });

    it('every level has all three gate types', () => {
      for (const level of LEVEL_ORDER) {
        expect(GATE_BEHAVIOR_MATRIX[level]).toHaveProperty('stage_gate');
        expect(GATE_BEHAVIOR_MATRIX[level]).toHaveProperty('reality_gate');
        expect(GATE_BEHAVIOR_MATRIX[level]).toHaveProperty('devils_advocate');
      }
    });
  });

  describe('checkAutonomy', () => {
    it('returns manual for L0 venture', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { autonomy_level: 'L0' }, error: null }),
            }),
          }),
        }),
      };
      const result = await checkAutonomy('v1', 'stage_gate', { supabase });
      expect(result.action).toBe('manual');
      expect(result.level).toBe('L0');
    });

    it('returns auto_approve for L2 venture stage gates', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { autonomy_level: 'L2' }, error: null }),
            }),
          }),
        }),
      };
      const result = await checkAutonomy('v1', 'stage_gate', { supabase });
      expect(result.action).toBe('auto_approve');
      expect(result.level).toBe('L2');
    });

    it('defaults to L0 on database error', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
            }),
          }),
        }),
      };
      const result = await checkAutonomy('v1', 'stage_gate', { supabase });
      expect(result.action).toBe('manual');
      expect(result.level).toBe('L0');
    });

    it('defaults to L0 for null autonomy_level', async () => {
      const supabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { autonomy_level: null }, error: null }),
            }),
          }),
        }),
      };
      const result = await checkAutonomy('v1', 'reality_gate', { supabase });
      expect(result.action).toBe('manual');
      expect(result.level).toBe('L0');
    });
  });

  describe('getAutonomyOverride', () => {
    it('returns null when no preference store', async () => {
      const result = await getAutonomyOverride('v1', {});
      expect(result).toBeNull();
    });

    it('returns override level when set', async () => {
      const chairmanPreferenceStore = {
        getPreference: vi.fn().mockResolvedValue({ value: 'L3' }),
      };
      const result = await getAutonomyOverride('v1', { chairmanPreferenceStore });
      expect(result).toBe('L3');
    });

    it('returns null for invalid override value', async () => {
      const chairmanPreferenceStore = {
        getPreference: vi.fn().mockResolvedValue({ value: 'INVALID' }),
      };
      const result = await getAutonomyOverride('v1', { chairmanPreferenceStore });
      expect(result).toBeNull();
    });
  });

  describe('autonomyPreCheck', () => {
    const makeSupabase = (level) => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { autonomy_level: level }, error: null }),
          }),
        }),
      }),
    });

    it('uses chairman override when present', async () => {
      const chairmanPreferenceStore = {
        getPreference: vi.fn().mockResolvedValue({ value: 'L4' }),
      };
      const result = await autonomyPreCheck('v1', 'stage_gate', {
        supabase: makeSupabase('L0'),
        chairmanPreferenceStore,
      });
      expect(result.level).toBe('L4');
      expect(result.action).toBe('auto_approve');
      expect(result.overridden).toBe(true);
    });

    it('falls back to venture level when no override', async () => {
      const result = await autonomyPreCheck('v1', 'reality_gate', {
        supabase: makeSupabase('L1'),
      });
      expect(result.level).toBe('L1');
      expect(result.action).toBe('manual');
      expect(result.overridden).toBe(false);
    });
  });

  describe('validateLevelTransition', () => {
    it('allows L0 → L1', () => {
      expect(validateLevelTransition('L0', 'L1')).toEqual({ valid: true });
    });

    it('allows L2 → L1 (demotion)', () => {
      expect(validateLevelTransition('L2', 'L1')).toEqual({ valid: true });
    });

    it('rejects L0 → L2 (skip)', () => {
      const result = validateLevelTransition('L0', 'L2');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('1 level at a time');
    });

    it('rejects unknown levels', () => {
      expect(validateLevelTransition('L5', 'L4').valid).toBe(false);
      expect(validateLevelTransition('L0', 'L9').valid).toBe(false);
    });

    it('rejects same level', () => {
      const result = validateLevelTransition('L2', 'L2');
      expect(result.valid).toBe(false);
    });
  });

  describe('MODULE_VERSION', () => {
    it('is 1.0.0', () => {
      expect(MODULE_VERSION).toBe('1.0.0');
    });
  });
});
