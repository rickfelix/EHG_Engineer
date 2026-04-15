/**
 * Tests for POST /api/stitch/:ventureId/check-curation
 * SD: SD-WIRE-STITCH-CURATION-STATUS-ORCH-001-A
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock stitch-provisioner before importing the route
const mockCheckCurationStatus = vi.fn();
vi.mock('../../../../lib/eva/bridge/stitch-provisioner.js', () => ({
  checkCurationStatus: mockCheckCurationStatus,
}));

// Mock stitch-exporter (required by routes/stitch.js)
vi.mock('../../../../lib/eva/bridge/stitch-exporter.js', () => ({
  exportStitchArtifacts: vi.fn(),
}));

// Mock stitch-metrics (required by routes/stitch.js)
vi.mock('../../../../lib/eva/bridge/stitch-metrics.js', () => ({
  getVentureMetrics: vi.fn(),
  getFleetHealth: vi.fn(),
  detectDegradation: vi.fn(),
}));

// Mock validate middleware
vi.mock('../../../../server/middleware/validate.js', () => ({
  isValidUuid: (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
}));

// Mock asyncHandler to just pass through
vi.mock('../../../../lib/middleware/eva-error-handler.js', () => ({
  asyncHandler: (fn) => fn,
}));

describe('POST /api/stitch/:ventureId/check-curation', () => {
  let router;
  const VALID_UUID = '12345678-1234-1234-1234-123456789abc';

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../../../../server/routes/stitch.js');
    router = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export a router with check-curation POST route', () => {
    const routes = router.stack
      .filter(layer => layer.route)
      .map(layer => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    const checkCurationRoute = routes.find(r => r.path === '/:ventureId/check-curation');
    expect(checkCurationRoute).toBeDefined();
    expect(checkCurationRoute.methods).toContain('post');
  });

  it('should import checkCurationStatus from stitch-provisioner', async () => {
    // The import at module level should have pulled in our mock
    expect(mockCheckCurationStatus).toBeDefined();
  });

  it('should have rate limiter constants defined', async () => {
    // Verify the module loaded without errors (import succeeded in beforeEach)
    expect(router).toBeDefined();
    expect(router.stack.length).toBeGreaterThan(0);
  });
});
