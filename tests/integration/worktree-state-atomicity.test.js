/**
 * Integration tests for SD-LEO-INFRA-LEO-INFRA-SESSION-001.
 *
 * Covers TS-1 (release-then-claim freshness) and TS-7 (no-regression in
 * claim_sd happy path + new worktree_path_before audit metadata).
 *
 * GATE: these tests require the FR-1 migration
 *   database/migrations/20260502_claim_sd_worktree_columns.sql
 * to be applied to the target Supabase project. Until then they skip with a
 * documented reason. To run after deploy:
 *
 *   RUN_DB_INTEGRATION_WORKTREE_STATE=1 npx vitest run \\
 *     tests/integration/worktree-state-atomicity.test.js
 *
 * Tests use unique synthetic session IDs and clean up after themselves so
 * they can run safely against the live DB.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import { rollbackWorktreeFilesystemSync } from '../../lib/worktree-manager.js';

const SHOULD_RUN = process.env.RUN_DB_INTEGRATION_WORKTREE_STATE === '1';

const describeIfDb = SHOULD_RUN ? describe : describe.skip;

describe('TS-2: WORKTREE_POST_CONDITION_FAILED produces no orphan directory (filesystem)', () => {
  let tempRoot;
  let orphanDir;

  beforeAll(() => {
    // Use a real temp dir on the OS so rmSync interacts with the real filesystem.
    // This deliberately avoids mocking fs so we can assert the directory is
    // actually gone after rollback runs.
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-rollback-'));
  });

  afterAll(() => {
    try { fs.rmSync(tempRoot, { recursive: true, force: true }); } catch { /* best effort */ }
  });

  it('rollbackWorktreeFilesystemSync removes the orphan directory via fs.rmSync fallback', () => {
    orphanDir = path.join(tempRoot, 'orphan-wt');
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'sentinel.txt'), 'this should be deleted');
    expect(fs.existsSync(orphanDir)).toBe(true);

    // Note: tempRoot is NOT a git repo, so `git worktree remove --force` will
    // fail every retry. The fs.rmSync fallback path is the one that actually
    // succeeds on this fixture — exactly the scenario we need to verify
    // (the rollback tolerates a non-registered orphan directory).
    const result = rollbackWorktreeFilesystemSync(orphanDir, tempRoot, { delaysMs: [0, 0, 0] });

    expect(result.ok).toBe(true);
    expect(result.fellBackToRmSync).toBe(true);
    expect(fs.existsSync(orphanDir)).toBe(false);
  });
});

describeIfDb('worktree-state atomicity (FR-1, integration, requires migration deployed)', () => {
  let supabase;
  /** session IDs we created — clean up at the end */
  const createdSessionIds = [];

  beforeAll(async () => {
    supabase = await createSupabaseServiceClient('engineer');
  });

  afterAll(async () => {
    if (!supabase) return;
    for (const sid of createdSessionIds) {
      await supabase.from('claude_sessions').delete().eq('session_id', sid);
    }
  });

  async function seedSession({ sessionId, sdKey, worktreePath, worktreeBranch, status = 'idle', heartbeatMinutesAgo = 0 }) {
    const heartbeatAt = new Date(Date.now() - heartbeatMinutesAgo * 60 * 1000).toISOString();
    const { error } = await supabase.from('claude_sessions').insert({
      session_id: sessionId,
      sd_key: sdKey,
      worktree_path: worktreePath,
      worktree_branch: worktreeBranch,
      status,
      heartbeat_at: heartbeatAt,
      machine_id: 'integration-test',
      terminal_id: sessionId,
      pid: 0,
      claimed_at: sdKey ? new Date().toISOString() : null
    });
    if (error) throw new Error(`seedSession failed: ${error.message}`);
    createdSessionIds.push(sessionId);
  }

  it('TS-1: release_sd clears worktree_path AND worktree_branch alongside sd_key', async () => {
    const sessionId = `it-ts1-${randomUUID()}`;
    const sdKey = `IT-SD-X-${Date.now()}`;
    const worktreePath = `/tmp/.worktrees/${sdKey}`;
    const worktreeBranch = `feat/${sdKey}`;

    await seedSession({
      sessionId,
      sdKey,
      worktreePath,
      worktreeBranch,
      status: 'active'
    });

    const { error: rpcError } = await supabase.rpc('release_sd', {
      p_session_id: sessionId,
      p_reason: 'integration_test_ts1'
    });
    expect(rpcError).toBeNull();

    const { data, error } = await supabase
      .from('claude_sessions')
      .select('sd_key, worktree_path, worktree_branch')
      .eq('session_id', sessionId)
      .single();
    expect(error).toBeNull();
    expect(data.sd_key).toBeNull();
    expect(data.worktree_path).toBeNull();
    expect(data.worktree_branch).toBeNull();
  });

  it('TS-3: ck_claude_sessions_worktree_state_consistency rejects INSERT with sd_key=NULL and worktree_path SET', async () => {
    const sessionId = `it-ts3-${randomUUID()}`;

    const { error } = await supabase.from('claude_sessions').insert({
      session_id: sessionId,
      sd_key: null,
      worktree_path: '/tmp/.worktrees/IT-SD-Z',
      worktree_branch: null,
      status: 'idle',
      heartbeat_at: new Date().toISOString(),
      machine_id: 'integration-test',
      terminal_id: sessionId,
      pid: 0
    });

    expect(error).not.toBeNull();
    // Constraint name appears in PostgreSQL's violation message
    expect(error.message + (error.details || '')).toMatch(/ck_claude_sessions_worktree_state_consistency/);

    // Confirm no row was actually inserted (constraint refused, transaction rolled back)
    const { data } = await supabase
      .from('claude_sessions')
      .select('session_id')
      .eq('session_id', sessionId);
    expect(data).toHaveLength(0);
  });

  it('TS-7: claim_sd takeover (force) emits CLAIM_TAKEOVER row with worktree_path_before / worktree_branch_before in metadata, and the new claim has NULL worktree state', async () => {
    const priorSession = `it-ts7-prior-${randomUUID()}`;
    const newSession = `it-ts7-new-${randomUUID()}`;
    const sdKey = `IT-SD-Y-${Date.now()}`;
    const worktreePath = `/tmp/.worktrees/${sdKey}-prior`;
    const worktreeBranch = `feat/${sdKey}`;

    // Prior session — heartbeat 5 minutes ago to satisfy ≥60s force-takeover threshold
    await seedSession({
      sessionId: priorSession,
      sdKey,
      worktreePath,
      worktreeBranch,
      status: 'active',
      heartbeatMinutesAgo: 5
    });

    // New session (the one taking over) — has its own row, fresh
    await seedSession({
      sessionId: newSession,
      sdKey: null,
      worktreePath: null,
      worktreeBranch: null,
      status: 'active'
    });

    const { data: rpcData, error: rpcError } = await supabase.rpc('claim_sd', {
      p_sd_id: sdKey,
      p_session_id: newSession,
      p_track: 'A',
      p_force_takeover: true
    });
    expect(rpcError).toBeNull();
    expect(rpcData?.success).toBe(true);
    expect(rpcData?.takeover).toBe(true);
    const auditEventId = rpcData?.audit_event_id;
    expect(auditEventId).toBeTruthy();

    // Audit row carries the new worktree_path_before / worktree_branch_before fields
    const { data: auditRow } = await supabase
      .from('session_lifecycle_events')
      .select('event_type, metadata')
      .eq('id', auditEventId)
      .single();
    expect(['CLAIM_TAKEOVER', 'CLAIM_AUTO_RECLAIM']).toContain(auditRow.event_type);
    expect(auditRow.metadata.worktree_path_before).toBe(worktreePath);
    expect(auditRow.metadata.worktree_branch_before).toBe(worktreeBranch);

    // Prior session's row is fully cleared
    const { data: priorAfter } = await supabase
      .from('claude_sessions')
      .select('sd_key, worktree_path, worktree_branch, status')
      .eq('session_id', priorSession)
      .single();
    expect(priorAfter.sd_key).toBeNull();
    expect(priorAfter.worktree_path).toBeNull();
    expect(priorAfter.worktree_branch).toBeNull();

    // New session holds the claim and has NULL worktree state (sd-start writes it later)
    const { data: newAfter } = await supabase
      .from('claude_sessions')
      .select('sd_key, worktree_path, worktree_branch')
      .eq('session_id', newSession)
      .single();
    expect(newAfter.sd_key).toBe(sdKey);
    expect(newAfter.worktree_path).toBeNull();
    expect(newAfter.worktree_branch).toBeNull();
  });
});

if (!SHOULD_RUN) {
  describe.skip('worktree-state atomicity (skipped — set RUN_DB_INTEGRATION_WORKTREE_STATE=1 after FR-1 migration deploys)', () => {
    it('placeholder', () => {
      expect(true).toBe(true);
    });
  });
}
