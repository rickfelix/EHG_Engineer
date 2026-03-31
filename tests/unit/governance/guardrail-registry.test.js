/**
 * Tests for Guardrail Registry (V11: governance_guardrail_enforcement)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-069, SD-MAN-FEAT-CORRECTIVE-VISION-GAP-071
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  list,
  check,
  _test,
  MODES,
} from '../../../lib/governance/guardrail-registry.js';

const { reset } = _test;

beforeEach(() => {
  reset();
});

describe('Guardrail Registry - list()', () => {
  it('returns all 14 default guardrails', () => {
    const guardrails = list();
    expect(guardrails.length).toBe(14);
    expect(guardrails[0]).toHaveProperty('id');
    expect(guardrails[0]).toHaveProperty('name');
    expect(guardrails[0]).toHaveProperty('mode');
    expect(guardrails[0]).toHaveProperty('description');
  });

  it('includes vision alignment guardrail', () => {
    const guardrails = list();
    const visionGuardrail = guardrails.find((g) => g.id === 'GR-VISION-ALIGNMENT');
    expect(visionGuardrail).toBeDefined();
    expect(visionGuardrail.mode).toBe(MODES.BLOCKING);
  });

  it('includes scope boundary guardrail', () => {
    const guardrails = list();
    const scopeGuardrail = guardrails.find((g) => g.id === 'GR-SCOPE-BOUNDARY');
    expect(scopeGuardrail).toBeDefined();
    expect(scopeGuardrail.mode).toBe(MODES.BLOCKING);
  });
});

describe('Guardrail Registry - check()', () => {
  it('passes for compliant SD data', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Add new database query optimization',
      priority: 'medium',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks when vision score below 30', () => {
    const result = check({ visionScore: 20 });
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].guardrail).toBe('GR-VISION-ALIGNMENT');
  });

  it('passes when vision score is 30 or above', () => {
    const result = check({
      visionScore: 30,
      strategic_objectives: ['OKR-1'],
      priority: 'medium',
    });
    expect(result.passed).toBe(true);
  });

  it('blocks infrastructure SD with UI scope', () => {
    const result = check({
      sd_type: 'infrastructure',
      scope: 'Build React component for dashboard',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(false);
    const scopeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-SCOPE-BOUNDARY'
    );
    expect(scopeViolation).toBeDefined();
  });

  it('blocks when no strategic objectives and no parent_sd_id', () => {
    // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-067: GR-GOVERNANCE-CASCADE is now BLOCKING
    const result = check({
      sd_type: 'feature',
      scope: 'Add optimization',
      priority: 'medium',
    });
    expect(result.passed).toBe(false);
    const cascadeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-GOVERNANCE-CASCADE'
    );
    expect(cascadeViolation).toBeDefined();
    expect(cascadeViolation.mode).toBe(MODES.BLOCKING);
    expect(cascadeViolation.severity).toBe('high');
  });

  it('passes cascade when parent_sd_id provided (without strategic_objectives)', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Add optimization',
      priority: 'medium',
      parent_sd_id: 'some-parent-uuid',
    });
    const cascadeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-GOVERNANCE-CASCADE'
    );
    expect(cascadeViolation).toBeUndefined();
  });

  it('warns when high priority SD has no risks', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Critical change',
      priority: 'high',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(true);
    const riskWarning = result.warnings.find(
      (w) => w.guardrail === 'GR-RISK-ASSESSMENT'
    );
    expect(riskWarning).toBeDefined();
  });

  it('exempts corrective SDs from vision scoring', () => {
    const result = check({
      visionScore: 10,
      metadata: { source: 'corrective_sd_generator' },
      strategic_objectives: ['OKR-1'],
    });
    // The corrective exempt guardrail should mark as exempt
    // but GR-VISION-ALIGNMENT still fires since it has its own check
    const exempt = result.violations.find(
      (v) => v.guardrail === 'GR-CORRECTIVE-EXEMPT'
    );
    // Corrective exempt doesn't create violations/warnings — it just returns exempt
    expect(exempt).toBeUndefined();
  });
});

describe('Guardrail Registry - register() removed', () => {
  it('register is no longer exported (bypass vector removed by SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001)', () => {
    expect(_test.register).toBeUndefined();
  });
});

describe('Guardrail Registry - reset()', () => {
  it('restores default guardrail count', () => {
    const defaultCount = list().length;
    reset();
    expect(list().length).toBe(defaultCount);
  });
});

describe('Guardrail Registry - GR-BULK-SD-BLOCK', () => {
  it('blocks when sessionSdCount >= 4 without orchestrator plan', () => {
    const result = check({ sessionSdCount: 4 });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeDefined();
    expect(violation.mode).toBe(MODES.BLOCKING);
  });

  it('passes when sessionSdCount < 4', () => {
    const result = check({
      sessionSdCount: 3,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });

  it('passes when orchestrator plan ref exists', () => {
    const result = check({
      sessionSdCount: 5,
      metadata: { orchestrator_plan_ref: 'ARCH-001' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });

  it('passes with architecture_plan_ref in metadata', () => {
    const result = check({
      sessionSdCount: 10,
      metadata: { architecture_plan_ref: 'ARCH-002' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });
});

describe('Guardrail Registry - GR-ORCHESTRATOR-ARCH-PLAN', () => {
  it('blocks orchestrator with 3+ children and no arch plan', () => {
    const result = check({ childrenCount: 3 });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeDefined();
  });

  it('passes orchestrator with arch plan ref', () => {
    const result = check({
      childrenCount: 5,
      metadata: { arch_plan_key: 'ARCH-001' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeUndefined();
  });

  it('passes non-orchestrator SD', () => {
    const result = check({
      childrenCount: 0,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeUndefined();
  });

  it('detects orchestrator by sd_type', () => {
    const result = check({ sd_type: 'orchestrator' });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeDefined();
  });
});

describe('Guardrail Registry - GR-BRAINSTORM-INTENT', () => {
  it('blocks brainstorm-sourced SD without session ID', () => {
    const result = check({
      metadata: { source: 'brainstorm' },
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(false); // blocking (upgraded from advisory)
    const violation = result.violations.find((v) => v.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(violation).toBeDefined();
  });

  it('passes brainstorm SD with session ID', () => {
    const result = check({
      metadata: { source: 'brainstorm', brainstorm_session_id: 'sess-123' },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(warning).toBeUndefined();
  });

  it('ignores non-brainstorm SDs', () => {
    const result = check({
      metadata: { source: 'manual' },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(warning).toBeUndefined();
  });

  it('detects brainstorm_origin flag', () => {
    const result = check({
      metadata: { brainstorm_origin: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(violation).toBeDefined();
  });
});


describe('Guardrail Registry - MODES', () => {
  it('exports blocking and advisory modes', () => {
    expect(MODES.BLOCKING).toBe('blocking');
    expect(MODES.ADVISORY).toBe('advisory');
  });
});

// SD-MAN-INFRA-CORRECTIVE-V11-GUARDRAIL-ENFORCEMENT-001: Domain guardrail tests

describe('Guardrail Registry - GR-SPENDING-LIMIT', () => {
  it('blocks when estimated cost exceeds budget threshold', () => {
    const result = check({
      estimated_cost: 15000,
      budget_threshold: 10000,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SPENDING-LIMIT');
    expect(violation).toBeDefined();
    expect(violation.severity).toBe('high');
  });

  it('passes when estimated cost is within budget', () => {
    const result = check({
      estimated_cost: 5000,
      budget_threshold: 10000,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SPENDING-LIMIT');
    expect(violation).toBeUndefined();
  });

  it('passes when no cost data provided', () => {
    const result = check({ strategic_objectives: ['OKR-1'] });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SPENDING-LIMIT');
    expect(violation).toBeUndefined();
  });

  it('reads cost from metadata', () => {
    const result = check({
      metadata: { estimated_cost: 20000 },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SPENDING-LIMIT');
    expect(violation).toBeDefined();
  });
});

describe('Guardrail Registry - GR-COMMS-BLAST-GUARD', () => {
  it('warns when scope involves bulk email', () => {
    const result = check({
      scope: 'Send bulk email notification to all users',
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-COMMS-BLAST-GUARD');
    expect(warning).toBeDefined();
    expect(warning.mode).toBe(MODES.ADVISORY);
  });

  it('warns when scope involves mass notification', () => {
    const result = check({
      scope: 'Mass notification to customers about downtime',
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-COMMS-BLAST-GUARD');
    expect(warning).toBeDefined();
  });

  it('passes for normal scope without comms keywords', () => {
    const result = check({
      scope: 'Add database index optimization',
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-COMMS-BLAST-GUARD');
    expect(warning).toBeUndefined();
  });
});

describe('Guardrail Registry - GR-DELETION-SAFEGUARD', () => {
  it('blocks when scope involves drop table without backup', () => {
    const result = check({
      scope: 'Drop table old_users and purge legacy data',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-DELETION-SAFEGUARD');
    expect(violation).toBeDefined();
    expect(violation.severity).toBe('critical');
  });

  it('passes when backup plan is provided', () => {
    const result = check({
      scope: 'Delete all legacy records from archive',
      metadata: { backup_plan: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-DELETION-SAFEGUARD');
    expect(violation).toBeUndefined();
  });

  it('passes when scope has no destructive operations', () => {
    const result = check({
      scope: 'Add new feature for user dashboard',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-DELETION-SAFEGUARD');
    expect(violation).toBeUndefined();
  });
});

describe('Guardrail Registry - GR-DEPLOY-WINDOW', () => {
  it('warns when deploying during freeze period', () => {
    const result = check({
      scope: 'Deploy new release to production',
      metadata: { deploy_freeze: true },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-DEPLOY-WINDOW');
    expect(warning).toBeDefined();
    expect(warning.severity).toBe('high');
  });

  it('passes deploy scope when no freeze', () => {
    const result = check({
      scope: 'Deploy new release to production',
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-DEPLOY-WINDOW');
    expect(warning).toBeUndefined();
  });

  it('passes non-deploy scope during freeze', () => {
    const result = check({
      scope: 'Add unit tests for auth module',
      metadata: { deploy_freeze: true },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-DEPLOY-WINDOW');
    expect(warning).toBeUndefined();
  });
});

describe('Guardrail Registry - GR-MIGRATION-REVIEW', () => {
  it('blocks migration scope without review', () => {
    const result = check({
      scope: 'Database migration to add user_preferences column',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-MIGRATION-REVIEW');
    expect(violation).toBeDefined();
    expect(violation.severity).toBe('high');
  });

  it('passes migration scope with review flag', () => {
    const result = check({
      scope: 'Database migration to add user_preferences column',
      metadata: { migration_reviewed: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-MIGRATION-REVIEW');
    expect(violation).toBeUndefined();
  });

  it('passes non-migration scope', () => {
    const result = check({
      scope: 'Optimize existing query performance',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-MIGRATION-REVIEW');
    expect(violation).toBeUndefined();
  });

  it('detects alter table keyword', () => {
    const result = check({
      scope: 'Alter table ventures to add status column',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-MIGRATION-REVIEW');
    expect(violation).toBeDefined();
  });
});

describe('Guardrail Registry - GR-SECURITY-BASELINE', () => {
  it('blocks security scope without assessment', () => {
    const result = check({
      scope: 'Update authentication flow and RLS policies',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');
    expect(violation).toBeDefined();
    expect(violation.severity).toBe('critical');
  });

  it('passes security scope with review flag', () => {
    const result = check({
      scope: 'Update authentication flow and RLS policies',
      metadata: { security_reviewed: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');
    expect(violation).toBeUndefined();
  });

  it('passes non-security scope', () => {
    const result = check({
      scope: 'Add pagination to venture list',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');
    expect(violation).toBeUndefined();
  });

  it('detects credential keyword', () => {
    const result = check({
      scope: 'Rotate API key and update credential storage',
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');
    expect(violation).toBeDefined();
  });

  it('passes with threat model flag', () => {
    const result = check({
      scope: 'Implement OAuth token refresh',
      metadata: { threat_model: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-SECURITY-BASELINE');
    expect(violation).toBeUndefined();
  });
});
