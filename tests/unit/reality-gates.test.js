/**
 * Tests for Reality Gate Enforcement
 * SD-LEO-INFRA-REALITY-GATES-001
 */
import { describe, it, expect, vi } from 'vitest';
import {
  evaluateRealityGate,
  getBoundaryConfig,
  isGatedBoundary,
  BOUNDARY_CONFIG,
  REASON_CODES,
  MODULE_VERSION,
  _internal,
} from '../../lib/eva/reality-gates.js';

const { verifyUrl } = _internal;

// --- Helpers ---

function createMockDb(artifacts = []) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: artifacts, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

function createFailingDb(errorMsg = 'Connection refused') {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockRejectedValue(new Error(errorMsg)),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

function createDbWithError(errorObj) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: null, error: errorObj }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

function mockHttpOk(status = 200) {
  return vi.fn().mockResolvedValue({ status, ok: true });
}

function mockHttpFail(status = 500) {
  return vi.fn().mockResolvedValue({ status, ok: false });
}

function mockHttpTimeout() {
  const err = new Error('Request timeout');
  err.code = 'ETIMEDOUT';
  return vi.fn().mockRejectedValue(err);
}

function mockHttpDnsFail() {
  const err = new Error('getaddrinfo ENOTFOUND example.com');
  err.code = 'ENOTFOUND';
  return vi.fn().mockRejectedValue(err);
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const fixedNow = () => new Date('2026-02-07T12:00:00Z');

function buildArtifacts(types, opts = {}) {
  return types.map(t => ({
    artifact_type: t,
    quality_score: opts.quality_score ?? 0.8,
    file_url: opts.file_url ?? null,
    is_current: true,
  }));
}

// --- Tests ---

describe('Reality Gates', () => {
  describe('Module exports', () => {
    it('exports expected API surface', () => {
      expect(typeof evaluateRealityGate).toBe('function');
      expect(typeof getBoundaryConfig).toBe('function');
      expect(typeof isGatedBoundary).toBe('function');
      expect(BOUNDARY_CONFIG).toBeDefined();
      expect(REASON_CODES).toBeDefined();
      expect(MODULE_VERSION).toBe('1.0.0');
    });

    it('exports all reason codes', () => {
      const expected = [
        'ARTIFACT_MISSING', 'QUALITY_SCORE_MISSING',
        'QUALITY_SCORE_BELOW_THRESHOLD', 'URL_UNREACHABLE',
        'DB_ERROR', 'CONFIG_ERROR',
      ];
      expect(Object.keys(REASON_CODES)).toEqual(expected);
    });

    it('has config for exactly 5 boundaries', () => {
      const boundaries = Object.keys(BOUNDARY_CONFIG);
      expect(boundaries).toEqual(['5->6', '9->10', '12->13', '16->17', '22->23']);
    });
  });

  describe('isGatedBoundary', () => {
    it('returns true for configured boundaries', () => {
      expect(isGatedBoundary(5, 6)).toBe(true);
      expect(isGatedBoundary(9, 10)).toBe(true);
      expect(isGatedBoundary(12, 13)).toBe(true);
      expect(isGatedBoundary(16, 17)).toBe(true);
      expect(isGatedBoundary(22, 23)).toBe(true);
    });

    it('returns false for non-boundary transitions', () => {
      expect(isGatedBoundary(1, 2)).toBe(false);
      expect(isGatedBoundary(6, 7)).toBe(false);
      expect(isGatedBoundary(21, 22)).toBe(false);
    });
  });

  describe('getBoundaryConfig', () => {
    it('returns config for a valid boundary', () => {
      const config = getBoundaryConfig(5, 6);
      expect(config).not.toBeNull();
      expect(config.description).toBe('SPARK → ENGINE');
      expect(config.required_artifacts.length).toBeGreaterThan(0);
    });

    it('returns null for non-boundary', () => {
      expect(getBoundaryConfig(3, 4)).toBeNull();
    });
  });

  describe('evaluateRealityGate - NOT_APPLICABLE', () => {
    it('returns NOT_APPLICABLE for non-boundary transitions', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v-123',
        fromStage: 1,
        toStage: 2,
        db: createMockDb(),
        now: fixedNow,
        logger: silentLogger,
      });
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.reasons).toEqual([]);
      expect(result.venture_id).toBe('v-123');
      expect(result.from_stage).toBe(1);
      expect(result.to_stage).toBe(2);
    });
  });

  describe('evaluateRealityGate - input validation', () => {
    it('fails with CONFIG_ERROR when ventureId is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: null,
        fromStage: 5,
        toStage: 6,
        db: createMockDb(),
        now: fixedNow,
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe('CONFIG_ERROR');
      expect(result.reasons[0].message).toMatch(/ventureId/);
    });

    it('fails with CONFIG_ERROR when db is missing', async () => {
      const result = await evaluateRealityGate({
        ventureId: 'v-123',
        fromStage: 5,
        toStage: 6,
        db: null,
        now: fixedNow,
        logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe('CONFIG_ERROR');
    });
  });

  describe('evaluateRealityGate - 5→6 Ideation → Validation', () => {
    const boundary = { fromStage: 5, toStage: 6 };
    const requiredTypes = ['problem_statement', 'target_market_analysis', 'value_proposition'];

    it('PASS when all artifacts exist with sufficient quality', async () => {
      const db = createMockDb(buildArtifacts(requiredTypes));
      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(result.reasons).toEqual([]);
      expect(result.evaluated_at).toBe('2026-02-07T12:00:00.000Z');
    });

    it('FAIL with ARTIFACT_MISSING when artifact is absent', async () => {
      const db = createMockDb(buildArtifacts(['problem_statement', 'value_proposition']));
      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].code).toBe('ARTIFACT_MISSING');
      expect(result.reasons[0].artifact_type).toBe('target_market_analysis');
    });

    it('FAIL with QUALITY_SCORE_MISSING when score is null', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[0].quality_score = null;
      const db = createMockDb(artifacts);
      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe('QUALITY_SCORE_MISSING');
      expect(result.reasons[0].artifact_type).toBe('problem_statement');
    });

    it('FAIL with QUALITY_SCORE_BELOW_THRESHOLD when score too low', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[2].quality_score = 0.3; // value_proposition below 0.6 threshold
      const db = createMockDb(artifacts);
      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe('QUALITY_SCORE_BELOW_THRESHOLD');
      expect(result.reasons[0].actual).toBe(0.3);
      expect(result.reasons[0].required).toBe(0.6);
    });

    it('collects ALL failures (no short-circuit)', async () => {
      const db = createMockDb([]);
      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons).toHaveLength(3);
      expect(result.reasons.every(r => r.code === 'ARTIFACT_MISSING')).toBe(true);
    });
  });

  describe('evaluateRealityGate - 16→17 Build → Launch (URL verification)', () => {
    const boundary = { fromStage: 16, toStage: 17 };
    const requiredTypes = ['mvp_build', 'test_coverage_report', 'deployment_runbook'];

    it('PASS when all artifacts + URL check succeeds', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[0].file_url = 'https://app.example.com';
      const db = createMockDb(artifacts);
      const httpClient = mockHttpOk(200);

      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, httpClient, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
      expect(httpClient).toHaveBeenCalledWith('https://app.example.com', expect.objectContaining({ method: 'HEAD' }));
    });

    it('FAIL with URL_UNREACHABLE when URL returns 500', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[0].file_url = 'https://app.example.com';
      const db = createMockDb(artifacts);
      const httpClient = mockHttpFail(500);

      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, httpClient, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const urlReason = result.reasons.find(r => r.code === 'URL_UNREACHABLE');
      expect(urlReason).toBeDefined();
      expect(urlReason.url).toBe('https://app.example.com');
    });

    it('FAIL with URL_UNREACHABLE when artifact has no file_url', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      const db = createMockDb(artifacts);
      const httpClient = mockHttpOk();

      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, httpClient, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      const urlReason = result.reasons.find(r => r.code === 'URL_UNREACHABLE');
      expect(urlReason).toBeDefined();
      expect(urlReason.message).toMatch(/no URL/);
    });

    it('skips URL verification when httpClient is not provided', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[0].file_url = 'https://app.example.com';
      const db = createMockDb(artifacts);

      const result = await evaluateRealityGate({
        ventureId: 'v-123', ...boundary, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
    });
  });

  describe('evaluateRealityGate - DB error (fail-closed)', () => {
    it('FAIL with DB_ERROR when query throws', async () => {
      const db = createFailingDb('ECONNREFUSED');
      const result = await evaluateRealityGate({
        ventureId: 'v-123', fromStage: 5, toStage: 6, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].code).toBe('DB_ERROR');
      expect(result.reasons[0].message).toMatch(/ECONNREFUSED/);
    });

    it('FAIL with DB_ERROR when query returns error object', async () => {
      const db = createDbWithError({ message: 'relation does not exist' });
      const result = await evaluateRealityGate({
        ventureId: 'v-123', fromStage: 9, toStage: 10, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons[0].code).toBe('DB_ERROR');
    });
  });

  describe('evaluateRealityGate - 22→23 BUILD LOOP → LAUNCH & LEARN', () => {
    const boundary = { fromStage: 22, toStage: 23 };
    const requiredTypes = ['launch_metrics', 'user_feedback_summary', 'production_app'];

    it('PASS when all artifacts present with URL check', async () => {
      const artifacts = buildArtifacts(requiredTypes, { quality_score: 0.8 });
      artifacts[2].file_url = 'https://prod.example.com';
      const db = createMockDb(artifacts);
      const httpClient = mockHttpOk(200);

      const result = await evaluateRealityGate({
        ventureId: 'v-456', ...boundary, db, httpClient, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('PASS');
    });

    it('FAIL with multiple reasons (missing + low quality)', async () => {
      const artifacts = [
        { artifact_type: 'user_feedback_summary', quality_score: 0.2, file_url: null, is_current: true },
        { artifact_type: 'production_app', quality_score: 0.8, file_url: 'https://prod.example.com', is_current: true },
      ];
      const db = createMockDb(artifacts);
      const httpClient = mockHttpOk(200);

      const result = await evaluateRealityGate({
        ventureId: 'v-456', ...boundary, db, httpClient, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      expect(result.reasons).toHaveLength(2);
      expect(result.reasons[0].code).toBe('ARTIFACT_MISSING');
      expect(result.reasons[0].artifact_type).toBe('launch_metrics');
      expect(result.reasons[1].code).toBe('QUALITY_SCORE_BELOW_THRESHOLD');
      expect(result.reasons[1].artifact_type).toBe('user_feedback_summary');
    });
  });

  describe('verifyUrl', () => {
    it('returns reachable for 200 OK', async () => {
      const httpClient = mockHttpOk(200);
      const result = await verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(true);
    });

    it('returns reachable for 301 redirect', async () => {
      const httpClient = mockHttpOk(301);
      const result = await verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(true);
    });

    it('returns unreachable for 404', async () => {
      const httpClient = mockHttpFail(404);
      const result = await verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(false);
      expect(result.detail).toMatch(/404/);
    });

    it('retries once on timeout then fails', async () => {
      const httpClient = mockHttpTimeout();
      const result = await verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(false);
      expect(httpClient).toHaveBeenCalledTimes(2);
    });

    it('does not retry on DNS failure', async () => {
      const httpClient = mockHttpDnsFail();
      const result = await verifyUrl('https://example.com', httpClient, silentLogger);
      expect(result.reachable).toBe(false);
      expect(httpClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Result contract (FR-5)', () => {
    it('includes all required fields in PASS result', async () => {
      const requiredTypes = ['problem_statement', 'target_market_analysis', 'value_proposition'];
      const db = createMockDb(buildArtifacts(requiredTypes));
      const result = await evaluateRealityGate({
        ventureId: 'v-123', fromStage: 5, toStage: 6, db, now: fixedNow, logger: silentLogger,
      });
      expect(result).toHaveProperty('venture_id', 'v-123');
      expect(result).toHaveProperty('from_stage', 5);
      expect(result).toHaveProperty('to_stage', 6);
      expect(result).toHaveProperty('status', 'PASS');
      expect(result).toHaveProperty('evaluated_at');
      expect(result).toHaveProperty('reasons');
      expect(Array.isArray(result.reasons)).toBe(true);
    });

    it('includes reason code/message/artifact in FAIL result', async () => {
      const db = createMockDb([]);
      const result = await evaluateRealityGate({
        ventureId: 'v-123', fromStage: 5, toStage: 6, db, now: fixedNow, logger: silentLogger,
      });
      expect(result.status).toBe('FAIL');
      for (const reason of result.reasons) {
        expect(reason).toHaveProperty('code');
        expect(reason).toHaveProperty('message');
        expect(reason.message.length).toBeLessThanOrEqual(200);
        expect(Object.values(REASON_CODES)).toContain(reason.code);
      }
    });
  });

  describe('Boundary config integrity', () => {
    it('every required artifact has valid min_quality_score', () => {
      for (const [key, config] of Object.entries(BOUNDARY_CONFIG)) {
        for (const artifact of config.required_artifacts) {
          expect(artifact.min_quality_score).toBeGreaterThan(0);
          expect(artifact.min_quality_score).toBeLessThanOrEqual(1);
          expect(typeof artifact.artifact_type).toBe('string');
          expect(typeof artifact.url_verification_required).toBe('boolean');
        }
      }
    });

    it('URL verification is only required for build/deploy artifacts', () => {
      for (const [key, config] of Object.entries(BOUNDARY_CONFIG)) {
        for (const artifact of config.required_artifacts) {
          if (artifact.url_verification_required) {
            expect(['mvp_build', 'production_app']).toContain(artifact.artifact_type);
          }
        }
      }
    });
  });
});
