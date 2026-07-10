/**
 * Integration tests (live DB) for SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001.
 * Self-skips without a real DB.
 *
 * TS-3: 3 feedback rows sharing a fingerprint are surfaced as one promotable group by
 * the FR-5 promoter (dry-run, so no live QF/worktree side effects); a row already
 * carrying metadata.promoted_to_qf is correctly reported as already-promoted, not
 * re-promotable.
 * TS-5: the FR-6 age-out job sets archived_at on a 31-day-old informational_note row
 * but leaves a 31-day-old harness_backlog row's archived_at NULL.
 * FR-8: a retrospective with a high-priority action item is surfaced by the promoter
 * (dry-run) with its text resolved from either the {item} or {action} field shape; a
 * retro already marked metadata.action_items_promoted is skipped.
 */
import { afterAll, afterEach, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { describeDb, itDb } from '../helpers/db-available.js';
import { fingerprint } from '../../lib/shared/content-fingerprint.cjs';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const seededIds = [];

async function seedFeedback(overrides = {}) {
  const { data, error } = await db
    .from('feedback')
    .insert({
      type: 'enhancement',
      category: overrides.category || 'harness_backlog',
      status: 'new',
      severity: overrides.severity || 'medium',
      source_application: 'EHG_Engineer',
      source_type: 'manual_feedback',
      title: overrides.title,
      description: overrides.description || '',
      metadata: overrides.metadata || {},
      created_at: overrides.created_at,
      updated_at: overrides.updated_at,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed failed: ${JSON.stringify(error)}`);
  seededIds.push(data.id);
  return data.id;
}

const seededRetroIds = [];

async function seedRetro(overrides = {}) {
  const { data, error } = await db
    .from('retrospectives')
    .insert({
      // sd_id has an FK to strategic_directives_v2(id) -- a UUID, not sd_key. Point at
      // this SD's own row (retro rows below are distinguished by id, not sd_id).
      sd_id: overrides.sd_id || '609345ea-540d-4685-b352-7e4391036bcc',
      title: overrides.title || 'Test retrospective',
      retro_type: overrides.retro_type || 'SD_COMPLETION',
      learning_category: overrides.learning_category || 'PROCESS_IMPROVEMENT',
      action_items: overrides.action_items || [],
      metadata: overrides.metadata || {},
      target_application: overrides.target_application || 'EHG_Engineer',
      status: 'DRAFT',
    })
    .select('id')
    .single();
  if (error) throw new Error(`seed retro failed: ${JSON.stringify(error)}`);
  seededRetroIds.push(data.id);
  return data.id;
}

describeDb('Harness-backlog drain policy (live DB)', () => {
  afterEach(async () => {
    if (seededIds.length > 0) {
      await db.from('feedback').delete().in('id', seededIds.splice(0, seededIds.length));
    }
    if (seededRetroIds.length > 0) {
      await db.from('retrospectives').delete().in('id', seededRetroIds.splice(0, seededRetroIds.length));
    }
  });

  itDb('3 rows sharing a fingerprint are reported as one promotable group; an already-marked row is skipped (TS-3)', async () => {
    const marker = `DRAIN-POLICY-TS3-${Date.now()}`;
    const title = `Recurring friction ${marker}`;
    const description = 'Same underlying defect, reported 3 times.';
    const expectedFp = fingerprint('harness_backlog_feedback', `${title}\n${description}`);

    const now = new Date().toISOString();
    await seedFeedback({ title, description, created_at: now, updated_at: now });
    await seedFeedback({ title, description, created_at: now, updated_at: now });
    await seedFeedback({ title, description, created_at: now, updated_at: now });

    const out = execSync('node scripts/feedback-fingerprint-promoter.mjs', { encoding: 'utf8', cwd: process.cwd() });
    expect(out).toContain(`[PROMOTABLE] fingerprint=${expectedFp.slice(0, 12)} occurrences=3`);
  });

  itDb('a fingerprint whose rows already carry metadata.promoted_to_qf is not re-promotable', async () => {
    const marker = `DRAIN-POLICY-TS3B-${Date.now()}`;
    const title = `Already-promoted friction ${marker}`;
    const description = 'This one was already promoted in a prior run.';
    const expectedFp = fingerprint('harness_backlog_feedback', `${title}\n${description}`);

    const now = new Date().toISOString();
    await seedFeedback({ title, description, created_at: now, updated_at: now, metadata: { promoted_to_qf: true } });
    await seedFeedback({ title, description, created_at: now, updated_at: now });
    await seedFeedback({ title, description, created_at: now, updated_at: now });

    const out = execSync('node scripts/feedback-fingerprint-promoter.mjs', { encoding: 'utf8', cwd: process.cwd() });
    expect(out).not.toContain(`[PROMOTABLE] fingerprint=${expectedFp.slice(0, 12)}`);
  });

  itDb('age-out sets archived_at on a stale informational_note row but not a stale harness_backlog row (TS-5)', async () => {
    const staleTs = new Date(Date.now() - 31 * 24 * 3600 * 1000).toISOString();
    const infoId = await seedFeedback({
      category: 'informational_note',
      title: `Stale informational ${Date.now()}`,
      created_at: staleTs,
      updated_at: staleTs,
    });
    const actionableId = await seedFeedback({
      category: 'harness_backlog',
      title: `Stale actionable ${Date.now()}`,
      created_at: staleTs,
      updated_at: staleTs,
    });

    execSync('node scripts/feedback-age-out.mjs --apply', { encoding: 'utf8', cwd: process.cwd() });

    const { data } = await db.from('feedback').select('id, category, archived_at').in('id', [infoId, actionableId]);
    const info = data.find(r => r.id === infoId);
    const actionable = data.find(r => r.id === actionableId);
    expect(info.archived_at).not.toBeNull();
    expect(actionable.archived_at).toBeNull();
  });

  itDb('a high-priority retro action item is surfaced by the promoter, resolving text from either {item} or {action} shape (FR-8)', async () => {
    const retroId = await seedRetro({
      action_items: [
        { item: 'Do the important thing (item-shape)', owner: 'someone', priority: 'high' },
        { action: 'Do the other important thing (action-shape)', owner: 'someone-else', priority: 'high' },
        { item: 'Low priority, should not surface', owner: 'nobody', priority: 'low' },
      ],
    });

    const out = execSync('node scripts/promote-retro-action-items.mjs', { encoding: 'utf8', cwd: process.cwd() });
    expect(out).toContain(`[PROMOTABLE] retro=${retroId}`);
    expect(out).toContain('high-priority action_items=2');
    expect(out).toContain('Do the important thing (item-shape)');
    expect(out).toContain('Do the other important thing (action-shape)');
    expect(out).not.toContain('Low priority, should not surface');
  });

  itDb('a retro already marked action_items_promoted is skipped', async () => {
    const retroId = await seedRetro({
      action_items: [{ item: 'Already handled', owner: 'someone', priority: 'high' }],
      metadata: { action_items_promoted: true },
    });

    const out = execSync('node scripts/promote-retro-action-items.mjs', { encoding: 'utf8', cwd: process.cwd() });
    expect(out).not.toContain(`retro=${retroId}`);
  });
});
