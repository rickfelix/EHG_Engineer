/**
 * SD-LEO-FEAT-VENTURE-DOMAIN-AVAILABILITY-001 — Stage-11 availability seam.
 * OFF (default): byte-identical decision shape (all-'pending', no Availability criterion).
 * ON (injected checker): availability-weighted scoring + real domain verdict + detail.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockComplete = vi.fn();
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

const { analyzeStage11 } = await import('../../../../../lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js');

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

const candidateNames = ['Craftbridge', 'ArtisanLink', 'Makerly', 'Handcraft', 'Loombridge'];

function llmPayload() {
  return JSON.stringify({
    namingStrategy: { approach: 'metaphorical', rationale: 'Fits brand' },
    scoringCriteria: [
      { name: 'Memorability', weight: 25 },
      { name: 'Relevance', weight: 25 },
      { name: 'Persona Resonance', weight: 25 },
      { name: 'Uniqueness', weight: 25 },
    ],
    candidates: candidateNames.map((name, i) => ({
      name,
      rationale: `Candidate ${i}`,
      scores: { Memorability: 70 + i, Relevance: 70, 'Persona Resonance': 70, Uniqueness: 70 },
      personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 80, reasoning: 'Fits' }],
    })),
    visualIdentity: {
      colorPalette: [{ name: 'Primary', hex: '#2563EB', usage: 'Primary', personaAlignment: 'Pro' }],
      typography: { heading: 'Inter', body: 'Inter', rationale: 'Clean' },
      imageryGuidance: 'Warm tones',
    },
    brandExpression: { tagline: 'T', elevator_pitch: 'E', messaging_pillars: ['A'] },
    decision: {
      selectedName: 'Craftbridge',
      workingTitle: true,
      rationale: 'Top scoring',
      availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' },
    },
    logoSpec: { textTreatment: 'T', primaryColor: '#2563EB', accentColor: '#10B981', typography: 'Inter', iconConcept: 'I', svgPrompt: 'S' },
  });
}

function stage10Data() {
  return {
    customerPersonas: [{ personaName: 'Tech-Savvy Artisan Founder', description: 'Founder' }],
    brandGenome: { archetype: 'Creator', tone: 'Warm', values: ['Craft'] },
  };
}

const stage1Data = { description: 'A platform connecting local artisans with global buyers' };

function run(extra = {}) {
  mockComplete.mockResolvedValueOnce(llmPayload());
  return analyzeStage11({ stage1Data, stage10Data: stage10Data(), logger: silentLogger, ...extra });
}

beforeEach(() => { mockComplete.mockReset(); delete process.env.DOMAIN_AVAILABILITY_MODE; });

describe('seam OFF (default)', () => {
  it('is byte-identical to pre-SD behavior: all-pending, no Availability criterion, no domainDetail', async () => {
    const result = await run();
    expect(result.decision.availabilityChecks).toEqual({ domain: 'pending', trademark: 'pending', social: 'pending' });
    expect(result.decision.domainDetail).toBeUndefined();
    expect(result.scoringCriteria.some(c => c.name === 'Availability')).toBe(false);
  });

  it('explicit null checker also stays off even if env is live (injection wins)', async () => {
    process.env.DOMAIN_AVAILABILITY_MODE = 'live';
    const result = await run({ availabilityChecker: null });
    expect(result.decision.availabilityChecks.domain).toBe('pending');
    expect(result.scoringCriteria.some(c => c.name === 'Availability')).toBe(false);
  });
});

describe('seam ON (injected checker)', () => {
  const mkChecker = (verdictFor) => async (name) => ({
    candidate: name,
    results: [
      { domain: `${name.toLowerCase()}.com`, verdict: verdictFor(name), checked_at: '2026-07-10T00:00:00Z', source: 'rdap' },
      { domain: `${name.toLowerCase()}.io`, verdict: 'taken', checked_at: '2026-07-10T00:00:00Z', source: 'rdap' },
    ],
    best: null,
  });

  it('adds the Availability criterion (weights re-sum to 100) and scores candidates', async () => {
    const checker = mkChecker((name) => (name === 'Makerly' ? 'available' : 'taken'));
    const result = await run({ availabilityChecker: checker });
    const avail = result.scoringCriteria.find(c => c.name === 'Availability');
    expect(avail).toBeTruthy();
    expect(result.scoringCriteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
    const makerly = result.candidates.find(c => c.name === 'Makerly');
    const craftbridge = result.candidates.find(c => c.name === 'Craftbridge');
    expect(makerly.scores['Availability']).toBe(100); // exact .com open
    expect(craftbridge.scores['Availability']).toBe(0); // all taken
  });

  it('decision carries the SELECTED name real verdict + domainDetail permutations', async () => {
    const checker = mkChecker(() => 'taken');
    const result = await run({ availabilityChecker: checker });
    expect(result.decision.selectedName).toBe('Craftbridge'); // LLM selection honored
    expect(result.decision.availabilityChecks.domain).toBe('taken'); // real verdict, string contract
    expect(result.decision.availabilityChecks.trademark).toBe('pending'); // untouched
    expect(result.decision.domainDetail.permutations).toHaveLength(2);
    expect(result.decision.domainDetail.checked_at).toBe('2026-07-10T00:00:00Z');
  });

  it('a throwing checker degrades honestly to pending (never breaks the stage)', async () => {
    const boom = async () => { throw new Error('rdap outage'); };
    // assessCandidateAvailability catches per-candidate; a fault in the seam itself also falls back.
    const result = await run({ availabilityChecker: boom });
    // per-candidate faults -> empty results -> verdict 'unknown' for selected name
    expect(['unknown', 'pending']).toContain(result.decision.availabilityChecks.domain);
    expect(result.candidates.length).toBeGreaterThanOrEqual(5); // stage output intact
  });
});
