/**
 * Integration Tests for Blocked State Detection System
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-12
 *
 * Tests the blocked state detection using real database queries.
 * This validates that the system works with actual orchestrator SDs.
 */

import { describe, it, expect } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  detectAllBlockedState,
  persistAllBlockedState,
  recordUserDecision
} from '../../scripts/modules/sd-next/blocked-state-detector.js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Blocked State Detection Integration', () => {
  describe('Module Exports', () => {
    it('should export detectAllBlockedState function', () => {
      expect(typeof detectAllBlockedState).toBe('function');
    });

    it('should export persistAllBlockedState function', () => {
      expect(typeof persistAllBlockedState).toBe('function');
    });

    it('should export recordUserDecision function', () => {
      expect(typeof recordUserDecision).toBe('function');
    });
  });

  describe('detectAllBlockedState - Core Logic', () => {
    it('should return error for non-existent orchestrator ID', async () => {
      const result = await detectAllBlockedState('NON-EXISTENT-ID', supabase);

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Orchestrator SD not found');
      expect(result.isAllBlocked).toBe(false);
    });

    it('should return error for non-orchestrator SD type', async () => {
      // Get any non-orchestrator SD
      const { data: nonOrchSD } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type')
        .neq('sd_type', 'orchestrator')
        .limit(1)
        .single();

      if (nonOrchSD) {
        const result = await detectAllBlockedState(nonOrchSD.id, supabase);

        expect(result).toHaveProperty('error');
        expect(result.error).toContain('not an orchestrator type');
        expect(result.isAllBlocked).toBe(false);
      }
    });

    it('should successfully analyze an active orchestrator SD', async () => {
      // Get an in_progress orchestrator
      const { data: orchSD } = await supabase
        .from('strategic_directives_v2')
        .select('id, title')
        .eq('sd_type', 'orchestrator')
        .eq('status', 'in_progress')
        .limit(1)
        .single();

      if (orchSD) {
        const result = await detectAllBlockedState(orchSD.id, supabase);

        // Basic structure validation
        expect(result).toHaveProperty('orchestratorId');
        expect(result).toHaveProperty('isAllBlocked');
        expect(result).toHaveProperty('totalChildren');
        expect(result).toHaveProperty('terminalChildren');
        expect(result).toHaveProperty('blockedChildren');
        expect(result).toHaveProperty('runnableChildren');
        expect(result).toHaveProperty('blockers');

        // Type validation
        expect(result.orchestratorId).toBe(orchSD.id);
        expect(typeof result.isAllBlocked).toBe('boolean');
        expect(typeof result.totalChildren).toBe('number');
        expect(Array.isArray(result.blockers)).toBe(true);

        // If blocked, validate blocker structure
        if (result.isAllBlocked && result.blockers.length > 0) {
          const blocker = result.blockers[0];
          expect(blocker).toHaveProperty('id');
          expect(blocker).toHaveProperty('type');
          expect(blocker).toHaveProperty('severity');
          expect(blocker).toHaveProperty('recommendedActions');
        }
      } else {
        console.log('⚠ No in_progress orchestrator found - skipping detailed test');
      }
    });
  });

  describe('recordUserDecision - Input Validation', () => {
    it('should reject invalid decision types', async () => {
      const result = await recordUserDecision(
        'SD-TEST-001',
        'invalid-action',
        {},
        supabase
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid decision');
    });

    it('should require reason for override decision', async () => {
      const result = await recordUserDecision(
        'SD-TEST-001',
        'override',
        { reason: 'short' }, // Too short (< 10 chars)
        supabase
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 10 characters');
    });

    it('should accept override with valid reason length', async () => {
      // This will fail because SD doesn't exist or isn't blocked,
      // but it validates the reason length check passed
      const result = await recordUserDecision(
        'SD-NON-EXISTENT',
        'override',
        { reason: 'This is a valid reason that is longer than 10 characters' },
        supabase
      );

      // Should not fail on reason validation
      if (result.error) {
        expect(result.error).not.toContain('at least 10 characters');
      }
    });
  });

  describe('Blocker Aggregation Logic', () => {
    it('should detect blockers with proper severity levels', async () => {
      const { data: orchSDs } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('sd_type', 'orchestrator')
        .limit(3);

      if (orchSDs && orchSDs.length > 0) {
        for (const orch of orchSDs) {
          const result = await detectAllBlockedState(orch.id, supabase);

          if (result.blockers && result.blockers.length > 0) {
            // Validate severity levels
            result.blockers.forEach(blocker => {
              expect(['HIGH', 'MEDIUM', 'LOW']).toContain(blocker.severity);
              expect(blocker.occurrences).toBeGreaterThan(0);
              expect(blocker.affectedChildIds).toBeDefined();
              expect(Array.isArray(blocker.affectedChildIds)).toBe(true);
            });
          }
        }
      }
    });
  });

  describe('System Integration', () => {
    it('should integrate with SDNextSelector display module', async () => {
      const displayModule = await import('../../scripts/modules/sd-next/display/blocked-state.js');

      expect(displayModule).toHaveProperty('displayBlockedStateBanner');
      expect(displayModule).toHaveProperty('getBlockedStateIndicator');
      expect(displayModule).toHaveProperty('isOrchestratorBlocked');

      expect(typeof displayModule.displayBlockedStateBanner).toBe('function');
      expect(typeof displayModule.getBlockedStateIndicator).toBe('function');
      expect(typeof displayModule.isOrchestratorBlocked).toBe('function');
    });

    it('should integrate with orchestrator-decision CLI', async () => {
      const fs = await import('fs');
      const cliPath = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\scripts\\orchestrator-decision.js';

      const cliExists = fs.existsSync(cliPath);
      expect(cliExists).toBe(true);

      if (cliExists) {
        const cliContent = fs.readFileSync(cliPath, 'utf-8');
        expect(cliContent).toContain('detectAllBlockedState');
        expect(cliContent).toContain('recordUserDecision');
        expect(cliContent).toContain('resume');
        expect(cliContent).toContain('cancel');
        expect(cliContent).toContain('override');
      }
    });

    it('should be imported by SDNextSelector', async () => {
      const fs = await import('fs');
      const selectorPath = 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\scripts\\modules\\sd-next\\SDNextSelector.js';

      const selectorExists = fs.existsSync(selectorPath);
      expect(selectorExists).toBe(true);

      if (selectorExists) {
        const selectorContent = fs.readFileSync(selectorPath, 'utf-8');
        expect(selectorContent).toContain('detectAllBlockedState');
        expect(selectorContent).toContain('persistAllBlockedState');
        expect(selectorContent).toContain('checkBlockedOrchestrators');
      }
    });
  });
});
