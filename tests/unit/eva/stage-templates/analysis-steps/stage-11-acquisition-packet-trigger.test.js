/**
 * SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-10 (class j) — Stage-11 completion triggers
 * composeAcquisitionPacket() automatically. composeAcquisitionPacket() itself is mocked at the
 * module level (it has its own dedicated tests in lib/venture-acquisition/); this file pins ONLY
 * that Stage 11 calls it, after artifact write-through, with the result surfaced non-fatally.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockComplete = vi.fn();
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: mockComplete }),
}));

const composeAcquisitionPacket = vi.fn();
vi.mock('../../../../../lib/venture-acquisition/decision-packet.js', () => ({
  composeAcquisitionPacket: (...args) => composeAcquisitionPacket(...args),
}));

const { analyzeStage11 } = await import('../../../../../lib/eva/stage-templates/analysis-steps/stage-11-visual-identity.js');

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };
const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

const candidateNames = ['Craftbridge', 'ArtisanLink', 'Makerly', 'Handcraft', 'Loombridge'];

function llmPayload() {
  return JSON.stringify({
    namingStrategy: { approach: 'metaphorical', rationale: 'Fits brand' },
    scoringCriteria: [
      { name: 'Memorability', weight: 25 }, { name: 'Relevance', weight: 25 },
      { name: 'Persona Resonance', weight: 25 }, { name: 'Uniqueness', weight: 25 },
    ],
    candidates: candidateNames.map((name, i) => ({
      name, rationale: `Candidate ${i}`,
      scores: { Memorability: 70 + i, Relevance: 70, 'Persona Resonance': 70, Uniqueness: 70 },
      personaFit: [{ personaName: 'Tech-Savvy Artisan Founder', fitScore: 80, reasoning: 'Fits' }],
    })),
    visualIdentity: { colorPalette: [{ name: 'Primary', hex: '#2563EB', usage: 'Primary', personaAlignment: 'Pro' }], typography: { heading: 'Inter', body: 'Inter', rationale: 'Clean' }, imageryGuidance: 'Warm tones' },
    brandExpression: { tagline: 'T', elevator_pitch: 'E', messaging_pillars: ['A'] },
    decision: { selectedName: 'Craftbridge', workingTitle: true, rationale: 'Top scoring', availabilityChecks: { domain: 'pending', trademark: 'pending', social: 'pending' } },
    logoSpec: { textTreatment: 'T', primaryColor: '#2563EB', accentColor: '#10B981', typography: 'Inter', iconConcept: 'I', svgPrompt: 'S' },
  });
}

const stage10Data = { customerPersonas: [{ personaName: 'Tech-Savvy Artisan Founder', description: 'Founder' }], brandGenome: { archetype: 'Creator', tone: 'Warm', values: ['Craft'] } };
const stage1Data = { description: 'A platform connecting local artisans with global buyers' };

/** Absorbs any query shape writeStage11Artifacts throws at it -- its own writes are non-fatal by design, so this only needs to not crash. */
function chainableStub() {
  const handler = {
    get(_t, prop) {
      if (prop === 'then') return undefined; // not thenable itself; only the terminal calls resolve
      if (['insert', 'update', 'upsert', 'select', 'eq', 'order', 'limit', 'maybeSingle', 'single'].includes(prop)) {
        return (..._args) => (prop === 'maybeSingle' || prop === 'single')
          ? Promise.resolve({ data: null, error: null })
          : new Proxy({}, handler);
      }
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

function run(extra = {}) {
  mockComplete.mockResolvedValueOnce(llmPayload());
  return analyzeStage11({ stage1Data, stage10Data, logger: silentLogger, ...extra });
}

beforeEach(() => {
  mockComplete.mockReset();
  composeAcquisitionPacket.mockReset();
  process.env.DOMAIN_AVAILABILITY_MODE = 'off'; // scope out the availability seam -- not this test's concern
});

describe('Stage 11 completion triggers composeAcquisitionPacket (FR-10)', () => {
  it('calls composeAcquisitionPacket with the venture id and selected name after artifact write-through, when supabase+ventureId are present', async () => {
    composeAcquisitionPacket.mockResolvedValue({ status: 'created', decision: { id: 'dec-1' } });
    const supabase = { from: () => chainableStub() };

    const result = await run({ supabase, ventureId: VENTURE_ID });

    expect(composeAcquisitionPacket).toHaveBeenCalledWith(supabase, VENTURE_ID, { selectedName: 'Craftbridge' });
    expect(result.acquisition_packet).toEqual({ status: 'created', decision: { id: 'dec-1' } });
  });

  it('never calls composeAcquisitionPacket when supabase or ventureId is absent (no DB context to act on)', async () => {
    await run();
    expect(composeAcquisitionPacket).not.toHaveBeenCalled();
  });

  it('a no_shortlist result (availability seam off, or no shortlist yet) is surfaced as a normal outcome, not an error', async () => {
    composeAcquisitionPacket.mockResolvedValue({ status: 'no_shortlist', unblock: 're-run with the seam on' });
    const supabase = { from: () => chainableStub() };

    const result = await run({ supabase, ventureId: VENTURE_ID });

    expect(result.acquisition_packet.status).toBe('no_shortlist');
  });

  it('composeAcquisitionPacket throwing is caught and surfaced non-fatally -- Stage 11 itself still completes', async () => {
    composeAcquisitionPacket.mockRejectedValue(new Error('registrar quote timeout'));
    const supabase = { from: () => chainableStub() };

    const result = await run({ supabase, ventureId: VENTURE_ID });

    expect(result.acquisition_packet).toEqual({ status: 'error', error: 'registrar quote timeout' });
    expect(result.decision).toBeDefined(); // Stage 11's own output is unaffected
  });
});
