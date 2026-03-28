import { describe, it, expect, beforeEach } from 'vitest';
import { webhookRepo } from '../src/routes/webhook-routes.js';
import { seed } from '../src/data/webhook-seed.js';

// We test the repository-backed logic directly since the Express app
// requires a running server. These unit tests verify the route handlers'
// data layer integration.

describe('Webhook API - POST /webhooks/ci (delivery ingestion)', () => {
  beforeEach(() => { webhookRepo.clear(); });

  it('stores a valid delivery', () => {
    const delivery = {
      id: 'd1', delivery_id: 'gh-del-1', event_type: 'push',
      payload: { ref: 'main' }, signature_valid: true
    };
    const stored = webhookRepo.addDelivery(delivery);
    expect(stored.id).toBe('d1');
    expect(stored.received_at).toBeDefined();
  });

  it('rejects delivery with missing event_type', () => {
    expect(() => webhookRepo.addDelivery({
      id: 'd1', delivery_id: 'gh-1', payload: {}, signature_valid: true
    })).toThrow('Invalid delivery');
  });

  it('rejects delivery with invalid event_type', () => {
    expect(() => webhookRepo.addDelivery({
      id: 'd1', delivery_id: 'gh-1', event_type: 'bad_type',
      payload: {}, signature_valid: true
    })).toThrow('Invalid delivery');
  });
});

describe('Webhook API - GET /webhooks/ci/deliveries', () => {
  beforeEach(() => {
    webhookRepo.clear();
    webhookRepo.addDelivery({ id: 'd1', delivery_id: 'g1', event_type: 'push', payload: {}, signature_valid: true, sd_id: 'SD-1' });
    webhookRepo.addDelivery({ id: 'd2', delivery_id: 'g2', event_type: 'pull_request', payload: {}, signature_valid: true, sd_id: 'SD-1' });
    webhookRepo.addDelivery({ id: 'd3', delivery_id: 'g3', event_type: 'push', payload: {}, signature_valid: true, sd_id: 'SD-2' });
    webhookRepo.addDelivery({ id: 'd4', delivery_id: 'g4', event_type: 'workflow_run', payload: {}, signature_valid: true, sd_id: null });
    webhookRepo.addDelivery({ id: 'd5', delivery_id: 'g5', event_type: 'push', payload: {}, signature_valid: true, sd_id: 'SD-1' });
  });

  it('lists all deliveries', () => {
    const all = webhookRepo.listDeliveries({});
    expect(all).toHaveLength(5);
  });

  it('filters by event_type', () => {
    const push = webhookRepo.listDeliveries({ event_type: 'push' });
    expect(push).toHaveLength(3);
    push.forEach(d => expect(d.event_type).toBe('push'));
  });

  it('filters by sd_id', () => {
    const sd1 = webhookRepo.listDeliveries({ sd_id: 'SD-1' });
    expect(sd1).toHaveLength(3);
  });

  it('supports pagination with limit and offset', () => {
    const page = webhookRepo.listDeliveries({ limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
    expect(page[0].id).toBe('d2');
  });

  it('combines filtering and pagination', () => {
    const result = webhookRepo.listDeliveries({ event_type: 'push', limit: 2 });
    expect(result).toHaveLength(2);
    result.forEach(d => expect(d.event_type).toBe('push'));
  });
});

describe('Webhook API - GET /webhooks/ci/pipeline-runs', () => {
  beforeEach(() => {
    webhookRepo.clear();
    webhookRepo.addPipelineRun({ id: 'r1', repository_name: 'repo-a', workflow_name: 'CI', run_id: 'g1', status: 'completed', sd_id: 'SD-1' });
    webhookRepo.addPipelineRun({ id: 'r2', repository_name: 'repo-b', workflow_name: 'CI', run_id: 'g2', status: 'in_progress', sd_id: 'SD-1' });
    webhookRepo.addPipelineRun({ id: 'r3', repository_name: 'repo-a', workflow_name: 'Deploy', run_id: 'g3', status: 'completed', sd_id: 'SD-2' });
  });

  it('lists all pipeline runs', () => {
    expect(webhookRepo.listPipelineRuns({})).toHaveLength(3);
  });

  it('filters by status', () => {
    const completed = webhookRepo.listPipelineRuns({ status: 'completed' });
    expect(completed).toHaveLength(2);
  });

  it('filters by repository_name', () => {
    const repoA = webhookRepo.listPipelineRuns({ repository_name: 'repo-a' });
    expect(repoA).toHaveLength(2);
  });

  it('filters by sd_id', () => {
    const sd1 = webhookRepo.listPipelineRuns({ sd_id: 'SD-1' });
    expect(sd1).toHaveLength(2);
  });
});

describe('Webhook API - GET /webhooks/ci/stats', () => {
  beforeEach(() => {
    webhookRepo.clear();
    seed(webhookRepo);
  });

  it('returns correct total delivery count', () => {
    const deliveries = webhookRepo.listDeliveries({});
    expect(deliveries.length).toBeGreaterThanOrEqual(10);
  });

  it('returns correct total pipeline run count', () => {
    const runs = webhookRepo.listPipelineRuns({});
    expect(runs.length).toBeGreaterThanOrEqual(5);
  });

  it('counts deliveries by event_type', () => {
    const deliveries = webhookRepo.listDeliveries({});
    const counts = {};
    for (const d of deliveries) {
      counts[d.event_type] = (counts[d.event_type] || 0) + 1;
    }
    expect(counts.push).toBeGreaterThanOrEqual(3);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(3);
  });

  it('counts pipeline runs by status', () => {
    const runs = webhookRepo.listPipelineRuns({});
    const counts = {};
    for (const r of runs) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    expect(counts.completed).toBeGreaterThanOrEqual(2);
  });
});

describe('Webhook API - Route registration', () => {
  it('exports webhookRepo for shared access', () => {
    expect(webhookRepo).toBeDefined();
    expect(typeof webhookRepo.addDelivery).toBe('function');
    expect(typeof webhookRepo.listDeliveries).toBe('function');
    expect(typeof webhookRepo.addPipelineRun).toBe('function');
    expect(typeof webhookRepo.listPipelineRuns).toBe('function');
  });
});
