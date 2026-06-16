/**
 * Proposal-ingest review-attestation parity — SD-LEO-INFRA-PROPOSAL-INGEST-REVIEW-FLAGS-001
 *
 * The proposal-ingest route (mapProposalToCreateArgs / ingestProposalObject and the
 * --from-proposal / --proposal-b64 / --proposal-stdin entry points) now honors the
 * migration_reviewed / security_reviewed review-attestation flags — bringing it to PARITY
 * with the direct-args route. The attestation comes from EITHER source:
 *   (a) proposal.metadata.migration_reviewed / security_reviewed === true, or
 *   (b) the threaded CLI flags --migration-reviewed / --security-reviewed (opts).
 *
 * THE EXISTENTIAL INVARIANT (FR-3, tested in BOTH directions): the attestation is set
 * ONLY on a strict `=== true`. A 'true' string, 1, false, null, or absence ALL leave the
 * flag UNSET — so a genuinely-unreviewed governed proposal is STILL blocked by
 * GR-MIGRATION-REVIEW / GR-SECURITY-BASELINE. The fix removes a FALSE block (an
 * already-reviewed proposal), it does NOT weaken the review gate.
 *
 * PURE: exercises the exported helpers with INJECTED deps. ZERO live DB access — keyExists
 * and createSD are faked through opts.deps (the real createSD uses a non-injectable supabase
 * singleton, never reached here).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mapProposalToCreateArgs,
  ingestProposalObject,
  createFromProposalB64,
  createFromProposalStdin,
} from '../../scripts/leo-create-sd.js';

const NORMALIZED = {
  sdKey: 'SD-LEO-INFRA-EXAMPLE-001',
  title: 'Example proposal',
  type: 'infrastructure',
  priority: 'high',
  rawType: 'infrastructure',
};

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

const b64Of = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

// ---------------------------------------------------------------------------
// FR-1 + FR-3: mapProposalToCreateArgs honors the attestation ONLY on === true,
// from proposal.metadata OR the opts (threaded CLI flags), never by coercion.
// ---------------------------------------------------------------------------
describe('mapProposalToCreateArgs — review-attestation pass-through (FR-1/FR-3)', () => {
  it('proposal.metadata.migration_reviewed===true → created metadata.migration_reviewed=true', () => {
    const p = validProposal({ metadata: { migration_reviewed: true } });
    expect(mapProposalToCreateArgs(NORMALIZED, p, 'p.json').metadata.migration_reviewed).toBe(true);
  });

  it('proposal.metadata.security_reviewed===true → created metadata.security_reviewed=true', () => {
    const p = validProposal({ metadata: { security_reviewed: true } });
    expect(mapProposalToCreateArgs(NORMALIZED, p, 'p.json').metadata.security_reviewed).toBe(true);
  });

  it('opts.migrationReviewed===true (threaded CLI flag) → created metadata.migration_reviewed=true', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, validProposal(), 'p.json', { migrationReviewed: true });
    expect(args.metadata.migration_reviewed).toBe(true);
  });

  it('opts.securityReviewed===true (threaded CLI flag) → created metadata.security_reviewed=true', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, validProposal(), 'p.json', { securityReviewed: true });
    expect(args.metadata.security_reviewed).toBe(true);
  });

  it('neither metadata nor opts → flags ABSENT (unattested stays unattested)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, validProposal(), 'p.json');
    expect(args.metadata).not.toHaveProperty('migration_reviewed');
    expect(args.metadata).not.toHaveProperty('security_reviewed');
  });

  // FR-3 / TS-4 — the no-weakening guard: any non-strict-true value must NOT attest.
  it.each([
    ['string "true"', 'true'],
    ['number 1', 1],
    ['false', false],
    ['null', null],
    ['object {}', {}],
  ])('proposal.metadata.migration_reviewed=%s (non-true) → flag NOT set', (_label, value) => {
    const p = validProposal({ metadata: { migration_reviewed: value, security_reviewed: value } });
    const args = mapProposalToCreateArgs(NORMALIZED, p, 'p.json');
    expect(args.metadata).not.toHaveProperty('migration_reviewed');
    expect(args.metadata).not.toHaveProperty('security_reviewed');
  });

  it.each([
    ['string "true"', 'true'],
    ['number 1', 1],
    ['false', false],
  ])('opts.migrationReviewed=%s (non-true) → flag NOT set (no coercion)', (_label, value) => {
    const args = mapProposalToCreateArgs(NORMALIZED, validProposal(), 'p.json', {
      migrationReviewed: value,
      securityReviewed: value,
    });
    expect(args.metadata).not.toHaveProperty('migration_reviewed');
    expect(args.metadata).not.toHaveProperty('security_reviewed');
  });

  it('flags are independent: only the attested one is set', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, validProposal({ metadata: { migration_reviewed: true } }), 'p.json');
    expect(args.metadata.migration_reviewed).toBe(true);
    expect(args.metadata).not.toHaveProperty('security_reviewed');
  });
});

// ---------------------------------------------------------------------------
// FR-2: ingestProposalObject threads migrationReviewed/securityReviewed from its
// options into mapProposalToCreateArgs, so the created SD's metadata carries them.
// ---------------------------------------------------------------------------
describe('ingestProposalObject — threads review flags into createSD args (FR-2)', () => {
  let logSpy;
  beforeEach(() => { logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  const baseDeps = () => ({ keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({ id: 'x' })) });

  it('options.migrationReviewed=true → createSD args metadata.migration_reviewed=true', async () => {
    const deps = baseDeps();
    await ingestProposalObject(validProposal(), '<unit>', { deps, migrationReviewed: true });
    expect(deps.createSD.mock.calls[0][0].metadata.migration_reviewed).toBe(true);
  });

  it('options.securityReviewed=true → createSD args metadata.security_reviewed=true', async () => {
    const deps = baseDeps();
    await ingestProposalObject(validProposal(), '<unit>', { deps, securityReviewed: true });
    expect(deps.createSD.mock.calls[0][0].metadata.security_reviewed).toBe(true);
  });

  it('proposal.metadata attestation also honored on the shared core (no CLI flag)', async () => {
    const deps = baseDeps();
    await ingestProposalObject(validProposal({ metadata: { migration_reviewed: true } }), '<unit>', { deps });
    expect(deps.createSD.mock.calls[0][0].metadata.migration_reviewed).toBe(true);
  });

  it('FR-3 no-weakening: neither flag nor metadata → createSD args carry NO attestation', async () => {
    const deps = baseDeps();
    await ingestProposalObject(validProposal(), '<unit>', { deps });
    const md = deps.createSD.mock.calls[0][0].metadata;
    expect(md).not.toHaveProperty('migration_reviewed');
    expect(md).not.toHaveProperty('security_reviewed');
  });

  it('FR-3 no-weakening: non-true option value → createSD args carry NO attestation', async () => {
    const deps = baseDeps();
    await ingestProposalObject(validProposal(), '<unit>', { deps, migrationReviewed: 'true', securityReviewed: 1 });
    const md = deps.createSD.mock.calls[0][0].metadata;
    expect(md).not.toHaveProperty('migration_reviewed');
    expect(md).not.toHaveProperty('security_reviewed');
  });
});

// ---------------------------------------------------------------------------
// FR-2 end-to-end on the file-free routes (--proposal-b64 / --proposal-stdin):
// the options carry straight through ingestProposalObject to the created SD.
// ---------------------------------------------------------------------------
describe('file-free routes thread review flags (FR-2)', () => {
  let logSpy, errorSpy;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { logSpy.mockRestore(); errorSpy.mockRestore(); });

  it('--proposal-b64 with migrationReviewed=true → created metadata.migration_reviewed=true', async () => {
    const deps = { keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalB64(b64Of(validProposal()), { deps, migrationReviewed: true });
    expect(deps.createSD.mock.calls[0][0].metadata.migration_reviewed).toBe(true);
  });

  it('--proposal-stdin with securityReviewed=true → created metadata.security_reviewed=true', async () => {
    const deps = { readStdin: async () => JSON.stringify(validProposal()), keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalStdin({ deps, securityReviewed: true });
    expect(deps.createSD.mock.calls[0][0].metadata.security_reviewed).toBe(true);
  });

  it('--proposal-stdin with NO attestation → created metadata carries neither flag', async () => {
    const deps = { readStdin: async () => JSON.stringify(validProposal()), keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalStdin({ deps });
    const md = deps.createSD.mock.calls[0][0].metadata;
    expect(md).not.toHaveProperty('migration_reviewed');
    expect(md).not.toHaveProperty('security_reviewed');
  });
});
