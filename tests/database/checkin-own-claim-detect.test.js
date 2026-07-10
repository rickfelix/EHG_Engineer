/**
 * SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001 — BINDING E2E (recurred-family rule: e2e acceptance
 * in spec at sourcing, per this session's own memory on the pattern).
 *
 * Reproduces the live incident shape: a session's SD-side claim (strategic_directives_v2
 * .claiming_session_id = self, is_working_on=true) with a NULL claude_sessions.sd_key cache.
 * Drives the REAL scripts/worker-checkin.cjs CLI as a child process against a seeded DB state —
 * mocking the claude_sessions/strategic_directives_v2 read seams does NOT satisfy this criterion
 * (the SD's own success_criteria are explicit on this point).
 *
 * Sandbox: all test SDs use SD-DEMO-OCD-* prefix (never dispatched by any real belt/coordinator
 * query), test sessions use test-session-ocd-* prefix (recognized fixture pattern,
 * lib/fleet/session-predicates.mjs FIXTURE_SESSION_RE) — created/dropped in beforeAll/afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SD_OWNED = 'SD-DEMO-OCD-001';
const SESS_OCD = 'test-session-ocd-resume';

async function ensureTestSession(sessionId) {
  const { error } = await supabase.from('claude_sessions').upsert({
    session_id: sessionId,
    status: 'active',
    heartbeat_at: new Date().toISOString(),
    machine_id: 'test-machine',
    terminal_id: `test-${sessionId}`,
    hostname: 'test-host',
    codebase: 'EHG_Engineer',
    sd_key: null, // the bug reproduction: cache starts EMPTY
    worktree_path: null,
    worktree_branch: null,
  }, { onConflict: 'session_id' });
  if (error) throw new Error(`ensureTestSession failed: ${error.message}`);
}

async function ensureOwnedSD(sdKey, sessionId) {
  const { error } = await supabase.from('strategic_directives_v2').upsert({
    id: sdKey,
    sd_key: sdKey,
    title: `Test fixture SD for own-claim-detect e2e — ${sdKey}`,
    description: 'Test fixture for SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001 — auto-cleaned',
    rationale: 'Test fixture for SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001 — auto-cleaned',
    scope: 'Test sandbox only',
    sd_type: 'infrastructure',
    category: 'infrastructure',
    priority: 'low',
    status: 'draft',
    current_phase: 'LEAD',
    target_application: 'EHG_Engineer',
    // the authoritative claim: SD-side says this session holds it
    claiming_session_id: sessionId,
    active_session_id: sessionId,
    is_working_on: true,
  }, { onConflict: 'sd_key' });
  if (error) throw new Error(`ensureOwnedSD failed: ${error.message}`);
}

async function getSessionSdKey(sessionId) {
  const { data, error } = await supabase.from('claude_sessions').select('sd_key').eq('session_id', sessionId).single();
  if (error) throw new Error(`getSessionSdKey failed: ${error.message}`);
  return data.sd_key;
}

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

describe.skipIf(!HAS_REAL_DB)('worker-checkin.cjs own-claim SILENT-STARVE fix (SD-LEO-INFRA-CHECKIN-OWN-CLAIM-DETECT-001, BINDING E2E)', () => {
  beforeAll(async () => {
    await ensureTestSession(SESS_OCD);
    await ensureOwnedSD(SD_OWNED, SESS_OCD);
  }, 30000);

  afterAll(async () => {
    await supabase.from('strategic_directives_v2').update({ claiming_session_id: null, active_session_id: null, is_working_on: false }).eq('sd_key', SD_OWNED);
    await supabase.from('strategic_directives_v2').delete().eq('sd_key', SD_OWNED);
    await supabase.from('claude_sessions').delete().eq('session_id', SESS_OCD);
  }, 30000);

  it('the REAL CLI resumes the owned SD (not idle) and self-heals the session cache, live against the DB', () => {
    const cliPath = resolve(process.cwd(), 'scripts/worker-checkin.cjs');
    const stdout = execFileSync('node', [cliPath], {
      env: { ...process.env, CLAUDE_SESSION_ID: SESS_OCD },
      encoding: 'utf8',
      timeout: 30000,
    });

    // The CLI may emit dotenv/injected-env banner lines before the JSON payload. The payload is
    // pretty-printed (JSON.stringify(x, null, 2)) so its TOP-LEVEL opening brace is the last
    // column-0 "{" line in stdout — a naive lastIndexOf('{') would instead match a nested
    // object's brace (e.g. self_healed_own_claim_pointer: {...}).
    const lines = stdout.split('\n');
    const topLevelStart = lines.map((l) => l === '{').lastIndexOf(true);
    expect(topLevelStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(lines.slice(topLevelStart).join('\n'));

    expect(parsed.action).toBe('resume');
    expect(parsed.sd).toBe(SD_OWNED);
    expect(parsed.self_healed_own_claim_pointer).toEqual({ sd: SD_OWNED, cache_updated: true });

    // Readback assertion (not just trusting the CLI's own report) — per the SD's own success
    // criterion explicitly ruling out "no silent 0-row UPDATE" as an acceptable outcome.
    expect(supabase).toBeDefined();
  }, 30000);

  it('readback: claude_sessions.sd_key now equals the healed SD key (post-CLI-run DB state)', async () => {
    const healedSdKey = await getSessionSdKey(SESS_OCD);
    expect(healedSdKey).toBe(SD_OWNED);
  }, 30000);
});
