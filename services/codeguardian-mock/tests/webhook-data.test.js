import { describe, it, expect, beforeEach } from 'vitest';
import {
  VALID_EVENT_TYPES, VALID_PIPELINE_STATUSES, VALID_CONCLUSIONS,
  VALID_SCAN_TYPES, VALID_SCAN_STATUSES, REQUIRED_FIELDS
} from '../src/data/webhook-schema.js';
import { validateWebhook } from '../src/data/webhook-validator.js';
import { WebhookRepository } from '../src/data/webhook-repository.js';
import { getSeedData, seed } from '../src/data/webhook-seed.js';

describe('Webhook Schema', () => {
  it('exports valid event types', () => {
    expect(VALID_EVENT_TYPES).toContain('push');
    expect(VALID_EVENT_TYPES).toContain('pull_request');
    expect(VALID_EVENT_TYPES).toContain('workflow_run');
    expect(VALID_EVENT_TYPES.length).toBeGreaterThanOrEqual(5);
  });

  it('exports valid pipeline statuses', () => {
    expect(VALID_PIPELINE_STATUSES).toContain('queued');
    expect(VALID_PIPELINE_STATUSES).toContain('completed');
    expect(VALID_PIPELINE_STATUSES.length).toBeGreaterThanOrEqual(5);
  });

  it('exports valid conclusions', () => {
    expect(VALID_CONCLUSIONS).toContain('success');
    expect(VALID_CONCLUSIONS).toContain('failure');
    expect(VALID_CONCLUSIONS.length).toBeGreaterThanOrEqual(7);
  });

  it('exports valid scan types', () => {
    expect(VALID_SCAN_TYPES).toContain('sast');
    expect(VALID_SCAN_TYPES).toContain('dependency');
    expect(VALID_SCAN_TYPES.length).toBeGreaterThanOrEqual(6);
  });

  it('exports required fields for all entity types', () => {
    expect(REQUIRED_FIELDS.delivery).toBeDefined();
    expect(REQUIRED_FIELDS.pipeline_run).toBeDefined();
    expect(REQUIRED_FIELDS.scan_event).toBeDefined();
  });
});

describe('Webhook Validator', () => {
  it('validates a correct delivery', () => {
    const result = validateWebhook('delivery', {
      id: 'd1', delivery_id: 'gh-1', event_type: 'push',
      payload: {}, signature_valid: true
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects delivery missing delivery_id', () => {
    const result = validateWebhook('delivery', {
      id: 'd1', event_type: 'push', payload: {}, signature_valid: true
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('delivery_id'))).toBe(true);
  });

  it('rejects delivery with invalid event_type', () => {
    const result = validateWebhook('delivery', {
      id: 'd1', delivery_id: 'gh-1', event_type: 'invalid_event',
      payload: {}, signature_valid: true
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('event_type'))).toBe(true);
  });

  it('validates a correct pipeline run', () => {
    const result = validateWebhook('pipeline_run', {
      id: 'r1', repository_name: 'test/repo', workflow_name: 'CI',
      run_id: 'gh-run-1', status: 'completed'
    });
    expect(result.valid).toBe(true);
  });

  it('rejects pipeline run with invalid status', () => {
    const result = validateWebhook('pipeline_run', {
      id: 'r1', repository_name: 'test/repo', workflow_name: 'CI',
      run_id: 'gh-run-1', status: 'bogus'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects pipeline run with invalid conclusion', () => {
    const result = validateWebhook('pipeline_run', {
      id: 'r1', repository_name: 'test/repo', workflow_name: 'CI',
      run_id: 'gh-run-1', status: 'completed', conclusion: 'bogus'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('conclusion'))).toBe(true);
  });

  it('validates a correct scan event', () => {
    const result = validateWebhook('scan_event', {
      id: 's1', pipeline_run_id: 'r1', scan_type: 'sast',
      findings_count: 3, status: 'completed'
    });
    expect(result.valid).toBe(true);
  });

  it('rejects scan event with non-numeric findings_count', () => {
    const result = validateWebhook('scan_event', {
      id: 's1', pipeline_run_id: 'r1', scan_type: 'sast',
      findings_count: 'three', status: 'completed'
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('findings_count'))).toBe(true);
  });

  it('rejects unknown entity type', () => {
    const result = validateWebhook('unknown_type', { id: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown entity type'))).toBe(true);
  });
});

describe('WebhookRepository - Deliveries', () => {
  let repo;

  beforeEach(() => { repo = new WebhookRepository(); });

  it('adds and retrieves a delivery', () => {
    const delivery = {
      id: 'd1', delivery_id: 'gh-1', event_type: 'push',
      payload: { ref: 'main' }, signature_valid: true
    };
    repo.addDelivery(delivery);
    const found = repo.getDelivery('d1');
    expect(found).toBeDefined();
    expect(found.delivery_id).toBe('gh-1');
    expect(found.received_at).toBeDefined();
  });

  it('returns null for missing delivery', () => {
    expect(repo.getDelivery('nonexistent')).toBeNull();
  });

  it('lists all deliveries', () => {
    repo.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true });
    repo.addDelivery({ id: 'd2', delivery_id: 'gh-2', event_type: 'pull_request', payload: {}, signature_valid: true });
    expect(repo.listDeliveries()).toHaveLength(2);
  });

  it('filters deliveries by event_type', () => {
    repo.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true });
    repo.addDelivery({ id: 'd2', delivery_id: 'gh-2', event_type: 'pull_request', payload: {}, signature_valid: true });
    repo.addDelivery({ id: 'd3', delivery_id: 'gh-3', event_type: 'push', payload: {}, signature_valid: true });
    const pushOnly = repo.listDeliveries({ event_type: 'push' });
    expect(pushOnly).toHaveLength(2);
    pushOnly.forEach(d => expect(d.event_type).toBe('push'));
  });

  it('filters deliveries by sd_id', () => {
    repo.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true, sd_id: 'SD-1' });
    repo.addDelivery({ id: 'd2', delivery_id: 'gh-2', event_type: 'push', payload: {}, signature_valid: true, sd_id: 'SD-2' });
    expect(repo.listDeliveries({ sd_id: 'SD-1' })).toHaveLength(1);
  });

  it('paginates deliveries', () => {
    for (let i = 0; i < 10; i++) {
      repo.addDelivery({ id: `d${i}`, delivery_id: `gh-${i}`, event_type: 'push', payload: {}, signature_valid: true });
    }
    const page = repo.listDeliveries({ limit: 3, offset: 2 });
    expect(page).toHaveLength(3);
  });

  it('updates a delivery', () => {
    repo.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true, processed_successfully: false });
    const updated = repo.updateDelivery('d1', { processed_successfully: true, processed_at: '2026-03-28T12:00:00Z' });
    expect(updated.processed_successfully).toBe(true);
    expect(updated.processed_at).toBe('2026-03-28T12:00:00Z');
    expect(updated.id).toBe('d1');
  });

  it('returns null when updating nonexistent delivery', () => {
    expect(repo.updateDelivery('nonexistent', {})).toBeNull();
  });

  it('deletes a delivery', () => {
    repo.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true });
    expect(repo.deleteDelivery('d1')).toBe(true);
    expect(repo.getDelivery('d1')).toBeNull();
    expect(repo.deleteDelivery('d1')).toBe(false);
  });

  it('throws on invalid delivery', () => {
    expect(() => repo.addDelivery({ id: 'd1' })).toThrow('Invalid delivery');
  });
});

describe('WebhookRepository - Pipeline Runs', () => {
  let repo;

  beforeEach(() => { repo = new WebhookRepository(); });

  it('adds and retrieves a pipeline run', () => {
    const run = {
      id: 'r1', repository_name: 'test/repo', workflow_name: 'CI',
      run_id: 'gh-run-1', status: 'completed', conclusion: 'success'
    };
    repo.addPipelineRun(run);
    expect(repo.getPipelineRun('r1')).toBeDefined();
    expect(repo.getPipelineRun('r1').conclusion).toBe('success');
  });

  it('filters pipeline runs by status', () => {
    repo.addPipelineRun({ id: 'r1', repository_name: 'a', workflow_name: 'CI', run_id: 'g1', status: 'completed' });
    repo.addPipelineRun({ id: 'r2', repository_name: 'a', workflow_name: 'CI', run_id: 'g2', status: 'in_progress' });
    expect(repo.listPipelineRuns({ status: 'completed' })).toHaveLength(1);
  });

  it('filters pipeline runs by repository_name', () => {
    repo.addPipelineRun({ id: 'r1', repository_name: 'repo-a', workflow_name: 'CI', run_id: 'g1', status: 'completed' });
    repo.addPipelineRun({ id: 'r2', repository_name: 'repo-b', workflow_name: 'CI', run_id: 'g2', status: 'completed' });
    expect(repo.listPipelineRuns({ repository_name: 'repo-a' })).toHaveLength(1);
  });

  it('updates a pipeline run', () => {
    repo.addPipelineRun({ id: 'r1', repository_name: 'a', workflow_name: 'CI', run_id: 'g1', status: 'in_progress' });
    const updated = repo.updatePipelineRun('r1', { status: 'completed', conclusion: 'success' });
    expect(updated.status).toBe('completed');
    expect(updated.conclusion).toBe('success');
  });

  it('deletes a pipeline run', () => {
    repo.addPipelineRun({ id: 'r1', repository_name: 'a', workflow_name: 'CI', run_id: 'g1', status: 'completed' });
    expect(repo.deletePipelineRun('r1')).toBe(true);
    expect(repo.getPipelineRun('r1')).toBeNull();
  });
});

describe('WebhookRepository - Scan Events', () => {
  let repo;

  beforeEach(() => {
    repo = new WebhookRepository();
    repo.addPipelineRun({ id: 'r1', repository_name: 'a', workflow_name: 'CI', run_id: 'g1', status: 'completed' });
  });

  it('adds and retrieves a scan event', () => {
    repo.addScanEvent({ id: 's1', pipeline_run_id: 'r1', scan_type: 'sast', findings_count: 5, status: 'completed' });
    expect(repo.getScanEvent('s1')).toBeDefined();
    expect(repo.getScanEvent('s1').findings_count).toBe(5);
  });

  it('throws when pipeline run does not exist', () => {
    expect(() => repo.addScanEvent({
      id: 's1', pipeline_run_id: 'nonexistent', scan_type: 'sast', findings_count: 0, status: 'completed'
    })).toThrow('Pipeline run not found');
  });

  it('filters scan events by scan_type', () => {
    repo.addScanEvent({ id: 's1', pipeline_run_id: 'r1', scan_type: 'sast', findings_count: 3, status: 'completed' });
    repo.addScanEvent({ id: 's2', pipeline_run_id: 'r1', scan_type: 'dependency', findings_count: 1, status: 'completed' });
    expect(repo.listScanEvents({ scan_type: 'sast' })).toHaveLength(1);
  });
});

describe('WebhookRepository - Export/Import', () => {
  it('round-trips data via export/import', () => {
    const repo1 = new WebhookRepository();
    repo1.addDelivery({ id: 'd1', delivery_id: 'gh-1', event_type: 'push', payload: {}, signature_valid: true });
    repo1.addPipelineRun({ id: 'r1', repository_name: 'a', workflow_name: 'CI', run_id: 'g1', status: 'completed' });
    repo1.addScanEvent({ id: 's1', pipeline_run_id: 'r1', scan_type: 'sast', findings_count: 2, status: 'completed' });

    const exported = repo1.export();
    const repo2 = new WebhookRepository();
    repo2.import(exported);

    expect(repo2.listDeliveries()).toHaveLength(1);
    expect(repo2.listPipelineRuns()).toHaveLength(1);
    expect(repo2.listScanEvents()).toHaveLength(1);
    expect(repo2.getDelivery('d1').delivery_id).toBe('gh-1');
  });
});

describe('Webhook Seed', () => {
  it('returns seed data with sufficient counts', () => {
    const data = getSeedData();
    expect(data.deliveries.length).toBeGreaterThanOrEqual(10);
    expect(data.pipelineRuns.length).toBeGreaterThanOrEqual(5);
    expect(data.scanEvents.length).toBeGreaterThanOrEqual(3);
  });

  it('populates a repository via seed()', () => {
    const repo = new WebhookRepository();
    seed(repo);
    expect(repo.listDeliveries().length).toBeGreaterThanOrEqual(10);
    expect(repo.listPipelineRuns().length).toBeGreaterThanOrEqual(5);
    expect(repo.listScanEvents().length).toBeGreaterThanOrEqual(3);
  });

  it('clears existing data before seeding', () => {
    const repo = new WebhookRepository();
    repo.addDelivery({ id: 'old', delivery_id: 'old', event_type: 'push', payload: {}, signature_valid: true });
    seed(repo);
    expect(repo.getDelivery('old')).toBeNull();
  });
});
