/**
 * SD-LEO-INFRA-ROADMAP-LINK-COUNTED-EXCEPTION-001 (FR-2) — the roadmap-link reason must reach
 * createSD from the PROPOSAL lane, not only from the direct lane.
 *
 * WHY THIS TEST EXISTS: the first cut of this SD wired --roadmap-link-reason into direct-lane.js
 * only. --from-proposal / --proposal-b64 / --proposal-stdin share mapProposalToCreateArgs and are
 * the CANONICAL Adam sourcing routes — i.e. where unlinked SDs are actually born at volume — so
 * every SD created there recorded NO_REASON_MARKER with no shipped way to supply a reason. The
 * drive-to-zero target could not be moved by the route that produces most of the gap: the exact
 * "recorded but unmovable" defect this SD exists to close, reproduced inside its own fix.
 *
 * PURE: exercises the exported mapper directly. ZERO live DB access.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapProposalToCreateArgs, ingestProposalObject, createFromProposalB64, createFromProposalStdin } from '../../scripts/leo-create-sd.js';

const NORMALIZED = {
  sdKey: 'SD-LEO-INFRA-UNLINKED-001',
  title: 'An unlinked SD',
  type: 'infrastructure',
  priority: 'medium',
  rawType: 'infrastructure',
};

function proposal(extra = {}) {
  return {
    PROPOSAL: true,
    status_intended: 'draft',
    proposed_sd_key: 'SD-LEO-INFRA-UNLINKED-001',
    title: 'An unlinked SD',
    sd_type: 'infrastructure',
    priority: 'medium',
    rationale: 'sourced without a preceding roadmap registration',
    scope: 'DOES: x. DOES NOT: y.',
    metadata: {},
    ...extra,
  };
}

describe('mapProposalToCreateArgs — roadmap_link_reason passthrough (FR-2)', () => {
  it('passes a declared reason through to createSD args', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'harness upkeep, no wave exists yet' }));
    expect(args.roadmap_link_reason).toBe('harness upkeep, no wave exists yet');
  });

  it('omits the key entirely when the proposal declares no reason (closed-whitelist invariant)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal());
    expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
  });

  it('treats an empty or whitespace-only reason as absent rather than as a supplied reason', () => {
    for (const blank of ['', '   ']) {
      const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: blank }));
      expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
    }
  });

  it('ignores a non-string reason instead of coercing it', () => {
    for (const junk of [42, true, {}, [], null]) {
      const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: junk }));
      expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
    }
  });

  it('NO-REGRESSION: adding the key does not disturb the other mapped args', () => {
    const withReason = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'a reason' }));
    const without = mapProposalToCreateArgs(NORMALIZED, proposal());
    expect(withReason.sdKey).toBe(without.sdKey);
    expect(withReason.title).toBe(without.title);
    expect(withReason.type).toBe(without.type);
    expect(withReason.metadata).toEqual(without.metadata);
  });
});

// ---------------------------------------------------------------------------
// QF-20260904-610: --roadmap-link-reason was parsed ONLY on the --from-plan branch of
// leo-create-sd.js; --from-proposal / --proposal-b64 / --proposal-stdin / --child never read
// it at all, so passing the flag on those lanes had zero effect (every mint still recorded
// NO_REASON_MARKER). mapProposalToCreateArgs/ingestProposalObject now also accept a THREADED
// CLI reason via opts.roadmapLinkReason, mirroring the existing plan-lane/direct-lane wiring.
// ---------------------------------------------------------------------------
describe('mapProposalToCreateArgs — threaded CLI opts.roadmapLinkReason (QF-20260904-610)', () => {
  it('a CLI-threaded reason passes through when the proposal JSON declares none', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal(), 'p.json', { roadmapLinkReason: 'CLI-supplied reason' });
    expect(args.roadmap_link_reason).toBe('CLI-supplied reason');
  });

  it('the CLI-threaded reason WINS over a JSON-declared reason (more deliberate, at-mint-time operator action)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'json reason' }), 'p.json', { roadmapLinkReason: 'cli reason' });
    expect(args.roadmap_link_reason).toBe('cli reason');
  });

  it('falls back to the JSON reason when the CLI opt is blank/whitespace-only', () => {
    for (const blank of ['', '   ']) {
      const args = mapProposalToCreateArgs(NORMALIZED, proposal({ roadmap_link_reason: 'json reason' }), 'p.json', { roadmapLinkReason: blank });
      expect(args.roadmap_link_reason).toBe('json reason');
    }
  });

  it('neither source supplied → key still absent (no regression on the closed-whitelist invariant)', () => {
    const args = mapProposalToCreateArgs(NORMALIZED, proposal(), 'p.json', {});
    expect(Object.prototype.hasOwnProperty.call(args, 'roadmap_link_reason')).toBe(false);
  });
});

describe('ingestProposalObject — threads roadmapLinkReason into createSD args (QF-20260904-610)', () => {
  const baseDeps = () => ({ keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({ id: 'x' })) });

  it('options.roadmapLinkReason → createSD args carry roadmap_link_reason', async () => {
    const deps = baseDeps();
    await ingestProposalObject(proposal(), '<unit>', { deps, roadmapLinkReason: 'harness week backfill' });
    expect(deps.createSD.mock.calls[0][0].roadmap_link_reason).toBe('harness week backfill');
  });

  it('the acceptance criterion, verbatim: a --from-proposal mint with the flag stamps reason_supplied via createSD, prints no dead-advice warning path', async () => {
    const deps = baseDeps();
    await ingestProposalObject(proposal(), '<unit>', { deps, roadmapLinkReason: 'acceptance-criterion reason' });
    // roadmap_link_reason reaching createSD's args is exactly what lets buildRoadmapLinkException
    // (invoked inside the real createSD, not this stub) stamp reason_supplied:true instead of
    // printing the ROADMAP_LINK_EXCEPTION warning -- see roadmap-link-exception.js.
    expect(deps.createSD.mock.calls[0][0]).toHaveProperty('roadmap_link_reason', 'acceptance-criterion reason');
  });

  it('no roadmapLinkReason option → createSD args carry no key (no regression)', async () => {
    const deps = baseDeps();
    await ingestProposalObject(proposal(), '<unit>', { deps });
    expect(deps.createSD.mock.calls[0][0]).not.toHaveProperty('roadmap_link_reason');
  });
});

describe('file-free routes thread roadmapLinkReason (QF-20260904-610)', () => {
  const b64Of = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

  it('--proposal-b64 with roadmapLinkReason → createSD args carry roadmap_link_reason', async () => {
    const deps = { keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalB64(b64Of(proposal()), { deps, roadmapLinkReason: 'b64 reason' });
    expect(deps.createSD.mock.calls[0][0].roadmap_link_reason).toBe('b64 reason');
  });

  it('--proposal-stdin with roadmapLinkReason → createSD args carry roadmap_link_reason', async () => {
    const deps = { readStdin: async () => JSON.stringify(proposal()), keyExists: vi.fn(async () => false), createSD: vi.fn(async () => ({})) };
    await createFromProposalStdin({ deps, roadmapLinkReason: 'stdin reason' });
    expect(deps.createSD.mock.calls[0][0].roadmap_link_reason).toBe('stdin reason');
  });
});

describe('leo-create-sd.js CLI wiring (QF-20260904-610, static source pins)', () => {
  const src = () => readFileSync(new URL('../../scripts/leo-create-sd.js', import.meta.url), 'utf8');

  it('--from-proposal, --proposal-b64 and --proposal-stdin all parse --roadmap-link-reason and thread it through', () => {
    const s = src();
    const fpStart = s.indexOf("args[0] === '--from-proposal'");
    const fpEnd = s.indexOf("} else if (args[0] === '--proposal-b64')");
    expect(s.slice(fpStart, fpEnd)).toContain('roadmapLinkReason,');

    const b64Start = s.indexOf("args[0] === '--proposal-b64'");
    const b64End = s.indexOf("} else if (args[0] === '--proposal-stdin')");
    expect(s.slice(b64Start, b64End)).toContain('roadmapLinkReason: b64RoadmapLinkReason,');

    const stdinStart = s.indexOf("args[0] === '--proposal-stdin'");
    const stdinEnd = s.indexOf("} else if (args[0] === '--from-plan')");
    expect(s.slice(stdinStart, stdinEnd)).toContain('roadmapLinkReason: stdinRoadmapLinkReason,');
  });

  it('--child parses --roadmap-link-reason onto childOverrides.roadmapLinkReason and excludes its value from index-arg detection', () => {
    const s = src();
    const childStart = s.indexOf("args[0] === '--child'");
    const childEnd = s.indexOf("const childRes = await createChild(");
    const childBody = s.slice(childStart, childEnd);
    expect(childBody).toContain("args.indexOf('--roadmap-link-reason')");
    expect(childBody).toContain('childOverrides.roadmapLinkReason');
    const flagSetStart = s.indexOf('const flagValuePositionsChild = new Set(');
    const flagSetEnd = s.indexOf(');', flagSetStart);
    expect(s.slice(flagSetStart, flagSetEnd)).toContain('childLinkReasonIdx');
  });
});
