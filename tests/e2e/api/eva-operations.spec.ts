/**
 * EVA Operations API E2E Tests
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-I
 *
 * Tests the EVA Operations REST API endpoints:
 *   GET /api/eva/operations/status
 *   GET /api/eva/operations/workers
 *
 * Requires a running server — do NOT run in unit/integration CI.
 * Start the server first: npm run dev (or npm start)
 */

import { test, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

test.describe('EVA Operations API E2E', () => {
  test.describe.configure({ mode: 'serial' });

  // ── GET /api/eva/operations/status ──────────────────────────────────────────

  test('GET /api/eva/operations/status — returns 200 with expected shape', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Top-level fields
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('overall');
    expect(data).toHaveProperty('subsystems');

    // Timestamp is ISO-8601
    expect(new Date(data.timestamp).getTime()).not.toBeNaN();

    // overall is one of the known status values
    expect(['healthy', 'degraded', 'unknown']).toContain(data.overall);
  });

  test('GET /api/eva/operations/status — subsystems has all 6 expected keys', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    const { subsystems } = data;

    expect(subsystems).toHaveProperty('health');
    expect(subsystems).toHaveProperty('metrics');
    expect(subsystems).toHaveProperty('feedback');
    expect(subsystems).toHaveProperty('enhancements');
    expect(subsystems).toHaveProperty('financial');
    expect(subsystems).toHaveProperty('scheduler');
  });

  test('GET /api/eva/operations/status — each subsystem has a status field', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const data = await response.json();

    for (const [key, sub] of Object.entries(data.subsystems as Record<string, { status: string }>)) {
      expect(sub, `subsystem "${key}" missing status field`).toHaveProperty('status');
      expect(typeof sub.status).toBe('string');
    }
  });

  test('GET /api/eva/operations/status — health subsystem has serviceCount', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const { subsystems } = await response.json();
    expect(subsystems.health).toHaveProperty('serviceCount');
    expect(typeof subsystems.health.serviceCount).toBe('number');
  });

  test('GET /api/eva/operations/status — metrics subsystem has recentMetrics', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const { subsystems } = await response.json();
    // recentMetrics present when supabase is connected; otherwise status='no-client'
    if (subsystems.metrics.status !== 'no-client') {
      expect(subsystems.metrics).toHaveProperty('recentMetrics');
    }
  });

  test('GET /api/eva/operations/status — scheduler subsystem has pendingJobs', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/status`);

    expect(response.status()).toBe(200);

    const { subsystems } = await response.json();
    if (subsystems.scheduler.status !== 'no-client') {
      expect(subsystems.scheduler).toHaveProperty('pendingJobs');
      expect(typeof subsystems.scheduler.pendingJobs).toBe('number');
    }
  });

  // ── GET /api/eva/operations/workers ────────────────────────────────────────

  test('GET /api/eva/operations/workers — returns 200 with cadence config', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/workers`);

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('workers');
  });

  test('GET /api/eva/operations/workers — cadence config has all 6 worker keys', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/workers`);

    expect(response.status()).toBe(200);

    const { workers } = await response.json();

    expect(workers).toHaveProperty('ops_financial_sync', 'hourly');
    expect(workers).toHaveProperty('ops_feedback_classify', 'frequent');
    expect(workers).toHaveProperty('ops_metrics_collect', 'six_hourly');
    expect(workers).toHaveProperty('ops_health_score', 'hourly');
    expect(workers).toHaveProperty('ops_enhancement_detect', 'daily');
    expect(workers).toHaveProperty('ops_status_snapshot', 'hourly');
  });

  test('GET /api/eva/operations/workers — all cadence values are strings', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/eva/operations/workers`);

    expect(response.status()).toBe(200);

    const { workers } = await response.json();

    for (const [key, cadence] of Object.entries(workers as Record<string, unknown>)) {
      expect(typeof cadence, `cadence for "${key}" should be a string`).toBe('string');
    }
  });
});
