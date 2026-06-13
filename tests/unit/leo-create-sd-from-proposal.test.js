/**
 * --from-proposal ingest unit tests — SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001
 *
 * Exercises the EXPORTED pure helpers (validateProposalShape, mapProposalToCreateArgs)
 * and createFromProposal's dry-run + idempotency via INJECTED deps. ZERO live DB access:
 * createSD uses a module-level supabase singleton that is not injectable, so no test
 * calls the real createSD/keyExists — they are faked through opts.deps.
 *
 * Pattern mirrors tests/unit/leo-create-sd-target-repos.test.js: process.exit is
 * mocked to THROW so fail-loud paths are assertable, console.error/log are spied.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateProposalShape,
  mapProposalToCreateArgs,
  createFromProposal,
} from '../../scripts/leo-create-sd.js';

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
    success_criteria: ['criterion a'],
    provenance: 'coordinator-go',
    roadmap_phase: 'phase-1',
    ...overrides,
  };
}

describe('validateProposalShape (SD-LEO-INFRA-FROM-PROPOSAL-INGEST-001)', () => {
  let exitSpy, errorSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`); });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { exitSpy.mockRestore(); errorSpy.mockRestore(); });

  it('valid proposal → normalized {sdKey verbatim, mapped type, lowercased priority}', () => {
    const n = validateProposalShape(validProposal(), 'p.json');
    expect(n).toEqual({
      sdKey: 'SD-LEO-INFRA-EXAMPLE-001', title: 'Example proposal',
      type: 'infrastructure', priority: 'high', rawType: 'infrastructure',
    });
  });

  it("sd_type alias 'infra' maps to canonical 'infrastructure'", () => {
    expect(validateProposalShape(validProposal({ sd_type: 'infra' }), 'p.json').type).toBe('infrastructure');
  });

  it('uppercase priority is lowercased', () => {
    expect(validateProposalShape(validProposal({ priority: 'HIGH' }), 'p.json').priority).toBe('high');
  });

  it.each(['proposed_sd_key', 'title', 'sd_type', 'priority'])('missing required field "%s" → [INVALID_PROPOSAL] + exit 1', (field) => {
    const p = validProposal(); delete p[field];
    expect(() => validateProposalShape(p, 'p.json')).toThrow('process.exit(1)');
    const msg = errorSpy.mock.calls.map(c => c[0]).join('\n');
    expect(msg).toContain('[INVALID_PROPOSAL]');
    expect(msg).toContain(field);
  });

  it('invalid sd_type → [INVALID_PROPOSAL_SD_TYPE] listing valid values + the bad value', () => {
    expect(() => validateProposalShape(validProposal({ sd_type: 'widget' }), 'p.json')).toThrow('process.exit(1)');
    const msg = errorSpy.mock.calls.map(c => c[0]).join('\n');
    expect(msg).toContain('[INVALID_PROPOSAL_SD_TYPE]');
    expect(msg).toContain('widget');
    expect(msg).toContain('infrastructure'); // valid values are listed by assertValidSdType
  });

  it('invalid priority → [INVALID_PROPOSAL_PRIORITY] + exit 1', () => {
    expect(() => validateProposalShape(validProposal({ priority: 'urgent' }), 'p.json')).toThrow('process.exit(1)');
    const msg = errorSpy.mock.calls.map(c => c[0]).join('\n');
    expect(msg).toContain('[INVALID_PROPOSAL_PRIORITY]');
    expect(msg).toContain('urgent');
  });

  it('non-proposal object (PROPOSAL!==true) → [INVALID_PROPOSAL] + exit 1', () => {
    const p = validProposal(); delete p.PROPOSAL;
    expect(() => validateProposalShape(p, 'p.json')).toThrow('process.exit(1)');
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('[INVALID_PROPOSAL]');
  });

  it('status_intended other than draft → [INVALID_PROPOSAL] + exit 1', () => {
    expect(() => validateProposalShape(validProposal({ status_intended: 'active' }), 'p.json')).toThrow('process.exit(1)');
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('[INVALID_PROPOSAL]');
  });
});

describe('mapProposalToCreateArgs (pure field mapping)', () => {
  const normalized = { sdKey: 'SD-LEO-INFRA-EXAMPLE-001', title: 'Example proposal', type: 'infrastructure', priority: 'high', rawType: 'infrastructure' };

  it('maps key verbatim, stamps metadata.source=proposal, no vision/arch/parent', () => {
    const args = mapProposalToCreateArgs(normalized, validProposal(), 'p.json');
    expect(args.sdKey).toBe('SD-LEO-INFRA-EXAMPLE-001');
    expect(args.type).toBe('infrastructure');
    expect(args.priority).toBe('high');
    expect(args.metadata.source).toBe('proposal');
    expect(args.metadata.proposal_file_path).toBe('p.json');
    expect(args.metadata.roadmap_phase).toBe('phase-1');
    expect(args.metadata.vision_key).toBeUndefined();
    expect(args.metadata.arch_key).toBeUndefined();
    expect(args.parentId).toBeUndefined();
    expect(args.success_criteria).toEqual(['criterion a']);
  });

  it('description falls back rationale -> scope -> title', () => {
    expect(mapProposalToCreateArgs(normalized, validProposal({ rationale: undefined }), 'p.json').description).toBe('DOES: x. DOES NOT: y.');
    expect(mapProposalToCreateArgs(normalized, validProposal({ rationale: undefined, scope: undefined }), 'p.json').description).toBe('Example proposal');
  });
});

describe('createFromProposal (dry-run + idempotency, injected deps, zero DB/FS)', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  const baseDeps = (over = {}) => ({
    resolveFiles: () => ['fake.json'],
    readFile: () => JSON.stringify(validProposal()),
    keyExists: vi.fn(async () => false),
    createSD: vi.fn(async () => ({ id: 'x' })),
    ...over,
  });

  it('--dry-run validates + reports but never calls createSD', async () => {
    const deps = baseDeps();
    const res = await createFromProposal('fake.json', { dryRun: true, deps });
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(deps.keyExists).toHaveBeenCalledWith('SD-LEO-INFRA-EXAMPLE-001');
    expect(res).toEqual([{ sdKey: 'SD-LEO-INFRA-EXAMPLE-001', file: 'fake.json', action: 'dry-run' }]);
  });

  it('idempotent: existing key is skipped, createSD not called', async () => {
    const deps = baseDeps({ keyExists: vi.fn(async () => true) });
    const res = await createFromProposal('fake.json', { deps });
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(res[0].action).toBe('skipped');
  });

  it('create path: new key → createSD called once with the verbatim key', async () => {
    const deps = baseDeps();
    const res = await createFromProposal('fake.json', { deps });
    expect(deps.createSD).toHaveBeenCalledTimes(1);
    expect(deps.createSD.mock.calls[0][0].sdKey).toBe('SD-LEO-INFRA-EXAMPLE-001');
    expect(res[0].action).toBe('created');
  });

  it('multi-file: each resolved file is processed independently', async () => {
    const deps = baseDeps({
      resolveFiles: () => ['a.json', 'b.json'],
      keyExists: vi.fn(async (k) => false),
    });
    const res = await createFromProposal('.prd-payloads/PROPOSAL-*.json', { dryRun: true, deps });
    expect(res).toHaveLength(2);
    expect(res.every(r => r.action === 'dry-run')).toBe(true);
  });
});
