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
  ingestProposalObject,
  createFromProposalB64,
  createFromProposalStdin,
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

  // Adversarial review w2b0qjnoa (2 HIGH): type-laxness — non-string required fields
  // and array-wrapped priority must NOT coerce through into createSD.
  it.each([
    ['title', []],
    ['title', 42],
    ['title', {}],
    ['title', ['Some Title']],
    ['proposed_sd_key', 42],
    ['proposed_sd_key', ['SD-X-2']],
    ['sd_type', 42],
    ['priority', ['high']], // single-element array previously String()-coerced to 'high'
    ['priority', 5],
  ])('non-string %s = %j → [INVALID_PROPOSAL] non-empty-string + exit 1 (no coercion)', (field, badValue) => {
    expect(() => validateProposalShape(validProposal({ [field]: badValue }), 'p.json')).toThrow('process.exit(1)');
    const msg = errorSpy.mock.calls.map(c => c[0]).join('\n');
    expect(msg).toContain('[INVALID_PROPOSAL]');
    expect(msg).toContain(field);
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

  it('sets a rationale (sibling parity): proposal rationale, else a provenance fallback', () => {
    expect(mapProposalToCreateArgs(normalized, validProposal(), 'p.json').rationale).toBe('because the belt needs refilling');
    expect(mapProposalToCreateArgs(normalized, validProposal({ rationale: undefined }), 'p.json').rationale).toContain('Materialized from proposal');
  });

  // Adversarial review w2b0qjnoa (invariant regression guard): a DIRTY proposal carrying
  // vision_key/arch_key/parent_id (top-level AND nested in metadata) must NOT leak those
  // into the mapped createSD args — else enrichFromVisionArch / orchestrator-routing /
  // parent-FK could silently re-activate. The closed whitelist is the protection.
  it('dirty proposal: vision_key/arch_key/parent_id never leak into mapped args', () => {
    const dirty = validProposal({
      vision_key: 'VIS-EVIL-001', arch_key: 'ARCH-EVIL-001', parent_id: 'SD-PARENT-001',
      parentId: 'SD-PARENT-002', metadata: { vision_key: 'VIS-NESTED-001', arch_key: 'ARCH-NESTED-001' },
    });
    const args = mapProposalToCreateArgs(normalized, dirty, 'p.json');
    expect(args.metadata.vision_key).toBeUndefined();
    expect(args.metadata.arch_key).toBeUndefined();
    expect(args.metadata.parent_id).toBeUndefined();
    expect(args.parentId).toBeUndefined();
    expect(args.vision_key).toBeUndefined();
    expect(args.arch_key).toBeUndefined();
    expect(args.metadata.source).toBe('proposal'); // only the closed whitelist survives
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

// SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001: file-free DB-direct ingest. The shared
// core (ingestProposalObject) plus the two file-free routes (--proposal-b64 / --proposal-stdin)
// must flow through the SAME validate -> keyExists -> map -> createSD path as the file route.
describe('ingestProposalObject (shared core — SD-LEO-INFRA-OPERATOR-SOURCING-DBDIRECT-001)', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  it('create path → {sdKey, file: source, action: created}, createSD called once with verbatim key', async () => {
    const deps = { keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({ id: 'x' })) };
    const res = await ingestProposalObject(validProposal(), '<unit>', { deps });
    expect(res).toEqual({ sdKey: 'SD-LEO-INFRA-EXAMPLE-001', file: '<unit>', action: 'created' });
    expect(deps.createSD).toHaveBeenCalledTimes(1);
    expect(deps.createSD.mock.calls[0][0].sdKey).toBe('SD-LEO-INFRA-EXAMPLE-001');
  });

  it('dry-run → action=dry-run, createSD never called; existing key → action=skipped', async () => {
    const dryDeps = { keyExists: vi.fn(async () => false), createSD: vi.fn() };
    expect((await ingestProposalObject(validProposal(), '<unit>', { dryRun: true, deps: dryDeps })).action).toBe('dry-run');
    expect(dryDeps.createSD).not.toHaveBeenCalled();

    const existDeps = { keyExists: vi.fn(async () => true), createSD: vi.fn() };
    expect((await ingestProposalObject(validProposal(), '<unit>', { deps: existDeps })).action).toBe('skipped');
    expect(existDeps.createSD).not.toHaveBeenCalled();
  });
});

describe('createFromProposalB64 / createFromProposalStdin (file-free routes)', () => {
  let exitSpy, errorSpy, logSpy;
  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`process.exit(${code})`); });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { exitSpy.mockRestore(); errorSpy.mockRestore(); logSpy.mockRestore(); });

  const b64Of = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

  // The core parity guarantee: sourcing via base64 produces the SAME createSD args as the
  // file path for the SAME proposal — modulo the provenance label (proposal_file_path),
  // which legitimately records WHERE the proposal came from.
  it('b64 ingest produces createSD args identical (modulo provenance) to the file path', async () => {
    const proposal = validProposal();

    const fileDeps = { resolveFiles: () => ['fake.json'], readFile: () => JSON.stringify(proposal), keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposal('fake.json', { deps: fileDeps });
    const fileArgs = fileDeps.createSD.mock.calls[0][0];

    const b64Deps = { keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalB64(b64Of(proposal), { deps: b64Deps });
    const b64Args = b64Deps.createSD.mock.calls[0][0];

    const strip = (a) => { const c = JSON.parse(JSON.stringify(a)); delete c.metadata.proposal_file_path; return c; };
    expect(strip(b64Args)).toEqual(strip(fileArgs));
    expect(b64Args.metadata.proposal_file_path).toBe('<proposal-b64>');
    expect(fileArgs.metadata.proposal_file_path).toBe('fake.json');
  });

  it('--proposal-b64 --dry-run never calls createSD; result file=<proposal-b64>', async () => {
    const deps = { keyExists: vi.fn(async () => false), createSD: vi.fn() };
    const res = await createFromProposalB64(b64Of(validProposal()), { dryRun: true, deps });
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(res).toEqual([{ sdKey: 'SD-LEO-INFRA-EXAMPLE-001', file: '<proposal-b64>', action: 'dry-run' }]);
  });

  it('--proposal-b64 idempotent: existing key skipped, createSD not called', async () => {
    const deps = { keyExists: vi.fn(async () => true), createSD: vi.fn() };
    const res = await createFromProposalB64(b64Of(validProposal()), { deps });
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(res[0].action).toBe('skipped');
  });

  it('--proposal-b64 with non-JSON after decode → [INVALID_PROPOSAL] + exit 1', async () => {
    const deps = { keyExists: vi.fn(async () => false), createSD: vi.fn() };
    // base64-decodes to plain text → JSON.parse fails (the load-bearing validator)
    await expect(createFromProposalB64(Buffer.from('this is not json').toString('base64'), { deps })).rejects.toThrow('process.exit(1)');
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('[INVALID_PROPOSAL]');
  });

  it('--proposal-b64 with empty/non-string arg → [INVALID_PROPOSAL] + exit 1', async () => {
    await expect(createFromProposalB64('', {})).rejects.toThrow('process.exit(1)');
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('[INVALID_PROPOSAL]');
  });

  it('--proposal-stdin routes injected stdin JSON through the shared core (file=<proposal-stdin>)', async () => {
    const deps = { readStdin: async () => JSON.stringify(validProposal()), keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    const res = await createFromProposalStdin({ deps });
    expect(deps.createSD).toHaveBeenCalledTimes(1);
    expect(deps.createSD.mock.calls[0][0].sdKey).toBe('SD-LEO-INFRA-EXAMPLE-001');
    expect(res).toEqual([{ sdKey: 'SD-LEO-INFRA-EXAMPLE-001', file: '<proposal-stdin>', action: 'created' }]);
  });

  it('--proposal-stdin with empty stdin → [INVALID_PROPOSAL] + exit 1', async () => {
    const deps = { readStdin: async () => '   ', createSD: vi.fn() };
    await expect(createFromProposalStdin({ deps })).rejects.toThrow('process.exit(1)');
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('[INVALID_PROPOSAL]');
  });

  it('--proposal-stdin with invalid JSON → [INVALID_PROPOSAL] + exit 1', async () => {
    const deps = { readStdin: async () => '{ not valid json', createSD: vi.fn() };
    await expect(createFromProposalStdin({ deps })).rejects.toThrow('process.exit(1)');
    expect(deps.createSD).not.toHaveBeenCalled();
  });

  // Adversarial review LOW-2: a stdin read failure (e.g. the real reader rejecting on an
  // interactive TTY with no piped input) must fail loud, never hang or proceed.
  it('--proposal-stdin when the reader rejects → [INVALID_PROPOSAL] cannot read stdin + exit 1', async () => {
    const deps = { readStdin: async () => { throw new Error('stdin is a TTY (no piped proposal JSON)'); }, createSD: vi.fn() };
    await expect(createFromProposalStdin({ deps })).rejects.toThrow('process.exit(1)');
    expect(deps.createSD).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.map(c => c[0]).join('\n')).toContain('cannot read stdin');
  });
});
