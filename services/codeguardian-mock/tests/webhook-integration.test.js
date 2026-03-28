import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { WebhookRepository } from '../src/data/webhook-repository.js';
import { validateWebhook } from '../src/data/webhook-validator.js';
import { getSeedData, seed } from '../src/data/webhook-seed.js';
import {
  VALID_EVENT_TYPES, VALID_PIPELINE_STATUSES, VALID_CONCLUSIONS,
  VALID_SCAN_TYPES, REQUIRED_FIELDS
} from '../src/data/webhook-schema.js';

// Integration tests: validate cross-layer behavior between
// C1 (data), C2 (API routes), and data flow end-to-end.

describe('Cross-Layer Integration: Schema → Validator → Repository', () => {
  let repo;
  beforeEach(() => { repo = new WebhookRepository(); });

  it('valid delivery passes validation and stores successfully', () => {
    const delivery = {
      id: 'int-d1', delivery_id: 'gh-int-1', event_type: 'push',
      payload: { ref: 'refs/heads/main' }, signature_valid: true
    };
    const { valid } = validateWebhook('delivery', delivery);
    expect(valid).toBe(true);
    const stored = repo.addDelivery(delivery);
    expect(repo.getDelivery('int-d1')).toBeDefined();
    expect(stored.received_at).toBeDefined();
  });

  it('invalid delivery fails validation and is NOT stored', () => {
    const bad = { id: 'int-d2', event_type: 'invalid_event', payload: {}, signature_valid: true };
    const { valid, errors } = validateWebhook('delivery', bad);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
    expect(() => repo.addDelivery(bad)).toThrow();
    expect(repo.getDelivery('int-d2')).toBeNull();
  });

  it('pipeline run with scan events creates full chain', () => {
    const run = {
      id: 'int-r1', repository_name: 'test/repo', workflow_name: 'CI',
      run_id: 'gh-run-int-1', status: 'completed', conclusion: 'success'
    };
    repo.addPipelineRun(run);
    const scan = {
      id: 'int-s1', pipeline_run_id: 'int-r1', scan_type: 'sast',
      findings_count: 5, status: 'completed'
    };
    repo.addScanEvent(scan);
    expect(repo.getPipelineRun('int-r1')).toBeDefined();
    expect(repo.getScanEvent('int-s1')).toBeDefined();
    expect(repo.listScanEvents({ pipeline_run_id: 'int-r1' })).toHaveLength(1);
  });

  it('scan event cannot reference nonexistent pipeline run', () => {
    expect(() => repo.addScanEvent({
      id: 'orphan', pipeline_run_id: 'nonexistent', scan_type: 'sast',
      findings_count: 0, status: 'completed'
    })).toThrow('Pipeline run not found');
  });
});

describe('Cross-Layer Integration: Seed → Repository → Query', () => {
  let repo;
  beforeEach(() => {
    repo = new WebhookRepository();
    seed(repo);
  });

  it('seed data is queryable across all entity types', () => {
    expect(repo.listDeliveries({}).length).toBeGreaterThanOrEqual(10);
    expect(repo.listPipelineRuns({}).length).toBeGreaterThanOrEqual(5);
    expect(repo.listScanEvents({}).length).toBeGreaterThanOrEqual(3);
  });

  it('filtering returns consistent results across entity types', () => {
    const pushDeliveries = repo.listDeliveries({ event_type: 'push' });
    expect(pushDeliveries.length).toBeGreaterThan(0);
    pushDeliveries.forEach(d => expect(d.event_type).toBe('push'));

    const completedRuns = repo.listPipelineRuns({ status: 'completed' });
    expect(completedRuns.length).toBeGreaterThan(0);
    completedRuns.forEach(r => expect(r.status).toBe('completed'));

    const sastScans = repo.listScanEvents({ scan_type: 'sast' });
    expect(sastScans.length).toBeGreaterThan(0);
    sastScans.forEach(s => expect(s.scan_type).toBe('sast'));
  });

  it('pagination works consistently with filtering', () => {
    const all = repo.listDeliveries({});
    const page1 = repo.listDeliveries({ limit: 3, offset: 0 });
    const page2 = repo.listDeliveries({ limit: 3, offset: 3 });
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(3);
    expect(page1[0].id).not.toBe(page2[0].id);
    expect(page1.length + page2.length).toBeLessThanOrEqual(all.length);
  });
});

describe('Cross-Layer Integration: Full Lifecycle', () => {
  let repo;
  beforeEach(() => { repo = new WebhookRepository(); });

  it('webhook → pipeline run → scan event → stats flow', () => {
    // Step 1: Receive webhook delivery
    const delivery = repo.addDelivery({
      id: 'lifecycle-d1', delivery_id: 'gh-lifecycle-1', event_type: 'workflow_run',
      payload: { action: 'completed', workflow_run: { id: 9999 } },
      signature_valid: true, sd_id: 'SD-TEST-LIFECYCLE'
    });
    expect(delivery.received_at).toBeDefined();

    // Step 2: Create pipeline run
    const run = repo.addPipelineRun({
      id: 'lifecycle-r1', sd_id: 'SD-TEST-LIFECYCLE',
      repository_name: 'test/lifecycle', workflow_name: 'CI',
      run_id: 'gh-run-lifecycle-1', status: 'completed', conclusion: 'success',
      started_at: '2026-03-28T12:00:00Z', completed_at: '2026-03-28T12:05:00Z'
    });

    // Step 3: Add scan results
    repo.addScanEvent({
      id: 'lifecycle-s1', pipeline_run_id: 'lifecycle-r1', scan_type: 'sast',
      findings_count: 2, status: 'completed',
      severity_summary: { critical: 0, high: 1, medium: 1, low: 0 }
    });
    repo.addScanEvent({
      id: 'lifecycle-s2', pipeline_run_id: 'lifecycle-r1', scan_type: 'dependency',
      findings_count: 0, status: 'completed',
      severity_summary: { critical: 0, high: 0, medium: 0, low: 0 }
    });

    // Step 4: Query by SD
    const sdDeliveries = repo.listDeliveries({ sd_id: 'SD-TEST-LIFECYCLE' });
    expect(sdDeliveries).toHaveLength(1);
    const sdRuns = repo.listPipelineRuns({ sd_id: 'SD-TEST-LIFECYCLE' });
    expect(sdRuns).toHaveLength(1);
    const scans = repo.listScanEvents({ pipeline_run_id: 'lifecycle-r1' });
    expect(scans).toHaveLength(2);

    // Step 5: Verify data integrity
    expect(sdRuns[0].conclusion).toBe('success');
    expect(scans.reduce((sum, s) => sum + s.findings_count, 0)).toBe(2);
  });

  it('update delivery marks as processed', () => {
    repo.addDelivery({
      id: 'upd-d1', delivery_id: 'gh-upd-1', event_type: 'push',
      payload: {}, signature_valid: true, processed_successfully: false
    });
    const updated = repo.updateDelivery('upd-d1', {
      processed_successfully: true, processed_at: '2026-03-28T12:00:01Z'
    });
    expect(updated.processed_successfully).toBe(true);
    expect(updated.processed_at).toBeDefined();
  });
});

describe('Cross-Layer Integration: Export/Import Round-Trip', () => {
  it('seeded data survives export/import cycle', () => {
    const repo1 = new WebhookRepository();
    seed(repo1);
    const exported = repo1.export();

    const repo2 = new WebhookRepository();
    repo2.import(exported);

    expect(repo2.listDeliveries({}).length).toBe(repo1.listDeliveries({}).length);
    expect(repo2.listPipelineRuns({}).length).toBe(repo1.listPipelineRuns({}).length);
    expect(repo2.listScanEvents({}).length).toBe(repo1.listScanEvents({}).length);

    // Verify specific record integrity
    const d1 = repo2.getDelivery('del-001');
    expect(d1).toBeDefined();
    expect(d1.event_type).toBe('push');
    expect(d1.sd_id).toBe('SD-TEST-001');
  });
});

describe('Cross-Layer Integration: Schema Constants Consistency', () => {
  it('all VALID_EVENT_TYPES are accepted by validator', () => {
    for (const type of VALID_EVENT_TYPES) {
      const { valid } = validateWebhook('delivery', {
        id: `test-${type}`, delivery_id: `gh-${type}`, event_type: type,
        payload: {}, signature_valid: true
      });
      expect(valid).toBe(true);
    }
  });

  it('all VALID_PIPELINE_STATUSES are accepted by validator', () => {
    for (const status of VALID_PIPELINE_STATUSES) {
      const { valid } = validateWebhook('pipeline_run', {
        id: `test-${status}`, repository_name: 'test', workflow_name: 'CI',
        run_id: `gh-${status}`, status
      });
      expect(valid).toBe(true);
    }
  });

  it('all VALID_SCAN_TYPES are accepted by validator', () => {
    for (const type of VALID_SCAN_TYPES) {
      const { valid } = validateWebhook('scan_event', {
        id: `test-${type}`, pipeline_run_id: 'r1', scan_type: type,
        findings_count: 0, status: 'completed'
      });
      expect(valid).toBe(true);
    }
  });

  it('REQUIRED_FIELDS matches entity constructor needs', () => {
    expect(REQUIRED_FIELDS.delivery).toContain('delivery_id');
    expect(REQUIRED_FIELDS.delivery).toContain('event_type');
    expect(REQUIRED_FIELDS.pipeline_run).toContain('run_id');
    expect(REQUIRED_FIELDS.pipeline_run).toContain('repository_name');
    expect(REQUIRED_FIELDS.scan_event).toContain('pipeline_run_id');
    expect(REQUIRED_FIELDS.scan_event).toContain('scan_type');
  });
});
