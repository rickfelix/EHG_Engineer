/**
 * --from-proposal metadata preservation — SD-LEO-INFRA-FROM-PROPOSAL-METADATA-PRESERVE-001
 *
 * The proposal-ingest mapper previously used a CLOSED whitelist that dropped custom
 * metadata keys (min_tier_rank, requires_human_action, deferred/_until) and never
 * translated metadata.target_repos -> canonical target_application. These tests assert
 * the new preserve-all-minus-leak-guard behavior + target translation.
 *
 * Pattern mirrors tests/unit/leo-create-sd-from-proposal.test.js (pure exported mapper).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateProposalShape, mapProposalToCreateArgs } from '../../scripts/leo-create-sd.js';

function validProposal(overrides = {}) {
  return {
    PROPOSAL: true,
    status_intended: 'draft',
    proposed_sd_key: 'SD-LEO-INFRA-EXAMPLE-001',
    title: 'Example proposal',
    sd_type: 'infrastructure',
    priority: 'high',
    rationale: 'because the belt needs refilling',
    scope: 'DOES: x. DOES NOT: y.',
    ...overrides,
  };
}

function mapped(proposal) {
  const n = validateProposalShape(proposal, 'p.json');
  return mapProposalToCreateArgs(n, proposal, 'p.json');
}

describe('FR-1/FR-3: preserve Adam-sourcing metadata keys', () => {
  it('carries min_tier_rank, requires_human_action, deferred/deferred_until onto the SD metadata', () => {
    const args = mapped(validProposal({
      sourced_by: 'adam',
      metadata: { min_tier_rank: 3, requires_human_action: true, deferred: true, deferred_until: '2026-07-01' },
    }));
    expect(args.metadata.min_tier_rank).toBe(3);
    expect(args.metadata.requires_human_action).toBe(true);
    expect(args.metadata.deferred).toBe(true);
    expect(args.metadata.deferred_until).toBe('2026-07-01');
  });

  it('preserves arbitrary custom keys (no longer whitelisted away)', () => {
    const args = mapped(validProposal({ metadata: { custom_flag: 'keep-me', nested: { a: 1 } } }));
    expect(args.metadata.custom_flag).toBe('keep-me');
    expect(args.metadata.nested).toEqual({ a: 1 });
  });

  it('canonical source still wins over a same-named proposal metadata key', () => {
    const args = mapped(validProposal({ metadata: { source: 'evil-override' } }));
    expect(args.metadata.source).toBe('proposal');
  });

  it('still DROPS the leak-guard keys arch_key / vision_key', () => {
    const args = mapped(validProposal({ metadata: { arch_key: 'ARCH-1', vision_key: 'VIS-1', keep: 1 } }));
    expect(args.metadata).not.toHaveProperty('arch_key');
    expect(args.metadata).not.toHaveProperty('vision_key');
    expect(args.metadata.keep).toBe(1);
  });
});

describe('FR-2/FR-4: translate target_repos -> target_application (validated)', () => {
  it('sets canonical target_application from the first repo and keeps normalized metadata.target_repos', () => {
    const args = mapped(validProposal({ metadata: { target_repos: ['EHG'] } }));
    expect(args.target_application).toBe('EHG');
    expect(args.metadata.target_repos).toEqual(['EHG']);
  });

  it('normalizes case/dedup via the shared validator', () => {
    const args = mapped(validProposal({ metadata: { target_repos: ['ehg', 'EHG', 'ehg_engineer'] } }));
    expect(args.target_application).toBe('EHG');
    expect(args.metadata.target_repos).toEqual(['EHG', 'EHG_Engineer']);
  });

  it('exits(1) on an invalid target_repos value (reuses ALLOWED_REPOS validator)', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`); });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mapped(validProposal({ metadata: { target_repos: ['NotARepo'] } }))).toThrow(/process\.exit\(1\)/);
    expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/INVALID_TARGET_REPOS/);
    exitSpy.mockRestore(); errorSpy.mockRestore();
  });

  it('no target_repos -> no target_application override (createSD keeps its default)', () => {
    const args = mapped(validProposal({ metadata: { min_tier_rank: 2 } }));
    expect(args).not.toHaveProperty('target_application');
    expect(args.metadata).not.toHaveProperty('target_repos');
  });
});

describe('END-TO-END regression (SD spec scenario)', () => {
  it('proposal with {min_tier_rank, requires_human_action, target_repos:[EHG]} yields the full canonical mapping', () => {
    const args = mapped(validProposal({
      sourced_by: 'adam',
      metadata: { min_tier_rank: 3, requires_human_action: true, target_repos: ['EHG'] },
    }));
    expect(args.metadata.min_tier_rank).toBe(3);
    expect(args.metadata.requires_human_action).toBe(true);
    expect(args.target_application).toBe('EHG');
    expect(args.metadata.target_repos).toEqual(['EHG']);
    expect(args.metadata.sourced_by).toBe('adam');
  });
});
