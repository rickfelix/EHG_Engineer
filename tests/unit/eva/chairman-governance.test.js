/**
 * Chairman Governance Tests
 *
 * Tests for chairman governance system components:
 * - Decision timeout and auto-escalation
 * - Chairman dashboard script
 * - Chairman seed data script
 * - Decision watcher (createOrReusePendingDecision, createAdvisoryNotification)
 * - Preference store validation
 * - Override tracker insights
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-I
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Path helpers
const ROOT = resolve(import.meta.dirname, '../../..');

describe('Chairman Governance', () => {
  describe('Decision Timeout Module', () => {
    const timeoutPath = resolve(ROOT, 'lib/eva/chairman-decision-timeout.js');

    it('exists and exports checkAndEscalateTimeouts', async () => {
      expect(existsSync(timeoutPath)).toBe(true);
      const mod = await import(timeoutPath);
      expect(typeof mod.checkAndEscalateTimeouts).toBe('function');
    });

    it('exists and exports getTimeoutConfig', async () => {
      const mod = await import(timeoutPath);
      expect(typeof mod.getTimeoutConfig).toBe('function');
    });

    it('getTimeoutConfig returns correct strategy for gate_decision', async () => {
      const { getTimeoutConfig } = await import(timeoutPath);
      const config = getTimeoutConfig('gate_decision');
      expect(config.strategy).toBe('auto_approve_with_flag');
      expect(config.timeoutMs).toBe(24 * 60 * 60 * 1000);
    });

    it('getTimeoutConfig returns correct strategy for advisory', async () => {
      const { getTimeoutConfig } = await import(timeoutPath);
      const config = getTimeoutConfig('advisory');
      expect(config.strategy).toBe('auto_acknowledge');
    });

    it('getTimeoutConfig returns correct strategy for override', async () => {
      const { getTimeoutConfig } = await import(timeoutPath);
      const config = getTimeoutConfig('override');
      expect(config.strategy).toBe('revert_to_system');
    });

    it('getTimeoutConfig uses custom timeout overrides', async () => {
      const { getTimeoutConfig } = await import(timeoutPath);
      const config = getTimeoutConfig('gate_decision', { gate_decision: 3600000 });
      expect(config.timeoutMs).toBe(3600000);
    });
  });

  describe('Chairman Dashboard Script', () => {
    const dashboardPath = resolve(ROOT, 'scripts/chairman-dashboard.js');

    it('exists', () => {
      expect(existsSync(dashboardPath)).toBe(true);
    });

    it('imports dotenv and supabase', () => {
      const src = readFileSync(dashboardPath, 'utf-8');
      expect(src).toContain("import dotenv from 'dotenv'");
      expect(src).toContain("from '@supabase/supabase-js'");
    });

    it('has getPendingDecisions function', () => {
      const src = readFileSync(dashboardPath, 'utf-8');
      expect(src).toContain('async function getPendingDecisions');
    });

    it('has getRecentDecisions function', () => {
      const src = readFileSync(dashboardPath, 'utf-8');
      expect(src).toContain('async function getRecentDecisions');
    });

    it('has getDecisionStats function', () => {
      const src = readFileSync(dashboardPath, 'utf-8');
      expect(src).toContain('async function getDecisionStats');
    });

    it('supports --json flag', () => {
      const src = readFileSync(dashboardPath, 'utf-8');
      expect(src).toContain('--json');
      expect(src).toContain('JSON_MODE');
    });
  });

  describe('Chairman Seed Data Script', () => {
    const seedPath = resolve(ROOT, 'scripts/chairman-seed-data.js');

    it('exists', () => {
      expect(existsSync(seedPath)).toBe(true);
    });

    it('supports --clean flag', () => {
      const src = readFileSync(seedPath, 'utf-8');
      expect(src).toContain('--clean');
      expect(src).toContain('CLEAN_MODE');
    });

    it('creates decisions at multiple lifecycle stages', () => {
      const src = readFileSync(seedPath, 'utf-8');
      expect(src).toContain('lifecycle_stage: 0');
      expect(src).toContain('lifecycle_stage: 5');
      expect(src).toContain('lifecycle_stage: 10');
      expect(src).toContain('lifecycle_stage: 22');
    });

    it('demonstrates auto-escalation in seed data', () => {
      const src = readFileSync(seedPath, 'utf-8');
      expect(src).toContain('auto_escalated');
      expect(src).toContain('auto_approve_with_flag');
    });

    it('creates both pending and resolved decisions', () => {
      const src = readFileSync(seedPath, 'utf-8');
      expect(src).toContain("status: 'pending'");
      expect(src).toContain("status: 'approved'");
      expect(src).toContain("status: 'rejected'");
    });
  });

  describe('Decision Watcher Module', () => {
    const watcherPath = resolve(ROOT, 'lib/eva/chairman-decision-watcher.js');

    it('exports waitForDecision', async () => {
      const mod = await import(watcherPath);
      expect(typeof mod.waitForDecision).toBe('function');
    });

    it('exports createOrReusePendingDecision', async () => {
      const mod = await import(watcherPath);
      expect(typeof mod.createOrReusePendingDecision).toBe('function');
    });

    it('exports createAdvisoryNotification', async () => {
      const mod = await import(watcherPath);
      expect(typeof mod.createAdvisoryNotification).toBe('function');
    });
  });

  describe('Preference Store Module', () => {
    const storePath = resolve(ROOT, 'lib/eva/chairman-preference-store.js');

    it('exports ChairmanPreferenceStore class', async () => {
      const mod = await import(storePath);
      expect(typeof mod.ChairmanPreferenceStore).toBe('function');
    });

    it('exports createChairmanPreferenceStore factory', async () => {
      const mod = await import(storePath);
      expect(typeof mod.createChairmanPreferenceStore).toBe('function');
    });

    it('has known key validators for risk and budget preferences', () => {
      const src = readFileSync(storePath, 'utf-8');
      expect(src).toContain("'risk.max_drawdown_pct'");
      expect(src).toContain("'budget.max_monthly_usd'");
      expect(src).toContain("'tech.stack_directive'");
    });
  });

  describe('Override Tracker Module', () => {
    const trackerPath = resolve(ROOT, 'lib/eva/stage-zero/chairman-override-tracker.js');

    it('exports recordOverride', async () => {
      const mod = await import(trackerPath);
      expect(typeof mod.recordOverride).toBe('function');
    });

    it('exports getOverridesByComponent', async () => {
      const mod = await import(trackerPath);
      expect(typeof mod.getOverridesByComponent).toBe('function');
    });

    it('exports generateOverrideInsights', async () => {
      const mod = await import(trackerPath);
      expect(typeof mod.generateOverrideInsights).toBe('function');
    });
  });
});
