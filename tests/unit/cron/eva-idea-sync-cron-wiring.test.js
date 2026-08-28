/**
 * SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 — wiring test for
 * .github/workflows/eva-idea-sync-cron.yml (FR-1, TR-3, FR-4 AC-2/AC-3, TR-5).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const WORKFLOW_PATH = path.join(repoRoot, '.github', 'workflows', 'eva-idea-sync-cron.yml');

describe('eva-idea-sync-cron.yml wiring', () => {
  const raw = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const doc = yaml.load(raw);

  it('exists and is scheduled (FR-1)', () => {
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
    // YAML parses the bare `on:` key as boolean `true` in js-yaml's default schema.
    const onBlock = doc.on ?? doc[true];
    expect(onBlock).toBeTruthy();
    expect(onBlock.schedule).toBeTruthy();
    expect(onBlock.schedule[0].cron).toBeTruthy();
  });

  it('has a concurrency group scoped to workflow+ref (TR-5)', () => {
    expect(doc.concurrency).toBeTruthy();
    expect(doc.concurrency.group).toMatch(/github\.workflow/);
    expect(doc.concurrency.group).toMatch(/github\.ref/);
  });

  it('invokes eva:ideas:sync -- --source all without a TODOIST_INTAKE_PROJECTS override (TR-3, FR-1 AC-3)', () => {
    expect(raw).toMatch(/npm run eva:ideas:sync -- --source all/);
    // Checks the PARSED env objects, not raw text — the workflow's own prose comment legitimately
    // documents why TODOIST_INTAKE_PROJECTS is deliberately absent, which a bare raw-text match
    // would false-fail on (mirrors tests/ddl/telegram-bot-insert-feedback-drop-ddl.db.test.js's
    // MIGRATION_CODE_ONLY comment-stripping convention).
    const jobEnv = doc.jobs.sync.env || {};
    expect(jobEnv).not.toHaveProperty('TODOIST_INTAKE_PROJECTS');
    for (const step of doc.jobs.sync.steps) {
      expect(step.env || {}).not.toHaveProperty('TODOIST_INTAKE_PROJECTS');
    }
  });

  it('has a post-run assertion step separate from the sync step (FR-4 AC-3)', () => {
    const steps = doc.jobs.sync.steps;
    const syncIdx = steps.findIndex((s) => (s.run || '').includes('eva:ideas:sync'));
    const verifyIdx = steps.findIndex((s) => (s.run || '').includes('eva-idea-sync-cron-assert.mjs --verify'));
    const captureIdx = steps.findIndex((s) => (s.run || '').includes('eva-idea-sync-cron-assert.mjs --capture'));
    expect(syncIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(-1);
    // Ordering: capture before sync before verify — a post-run check run before the sync step
    // (or a pre-run capture taken after it) would compare the wrong watermark.
    expect(captureIdx).toBeLessThan(syncIdx);
    expect(syncIdx).toBeLessThan(verifyIdx);
  });

  it('includes an if: failure() step (FR-4 AC-2)', () => {
    const steps = doc.jobs.sync.steps;
    const failureStep = steps.find((s) => s.if && s.if.includes('failure()'));
    expect(failureStep).toBeTruthy();
  });

  it('wires YOUTUBE_API_KEY and YOUTUBE_FOR_PROCESSING_PLAYLIST_ID as secrets, never plaintext (SD-LEO-FEAT-YOUTUBE-INGESTION-CREDENTIAL-001 FR-2/FR-3, TS-7)', () => {
    const jobEnv = doc.jobs.sync.env || {};
    expect(jobEnv.YOUTUBE_API_KEY).toBe('${{ secrets.YOUTUBE_API_KEY }}');
    expect(jobEnv.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID).toBe('${{ secrets.YOUTUBE_FOR_PROCESSING_PLAYLIST_ID }}');
  });
});
