/**
 * SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 (FR-4) — trg_subagent_evidence_reject_control_chars
 * must BLOCK (not just document) control-character corruption in sub_agent_execution_results.
 *
 * Live-DB integration test, gated like the other tests/database suites so CI skips cleanly
 * without service-role creds. Every inserted row (rejected attempts never persist; the one
 * accepted row is hard-deleted in afterAll) is a disposable fixture row this suite owns —
 * no shared/live row is ever touched, matching the hermetic-fixture precedent established
 * for tests/database/switch-sd-claim-guards.test.js (QF-20260702-290).
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const SUB_AGENT_CODE = 'TEST_TRIGGER_PROBE_SD_LEO_INFRA_FIX_SYSTEMIC_WINDOWS_001';
const acceptedRowIds = [];

describe.skipIf(!HAS_REAL_DB)('trg_subagent_evidence_reject_control_chars (SD-LEO-INFRA-FIX-SYSTEMIC-WINDOWS-001 FR-2/FR-4)', () => {
  afterAll(async () => {
    if (acceptedRowIds.length) {
      await supabase.from('sub_agent_execution_results').delete().in('id', acceptedRowIds);
    }
  });

  it('rejects an INSERT with a control-char-corrupted metadata.repo_path', async () => {
    const corrupted = 'C:/Users/rickf' + String.fromCharCode(0x0D) + 'ickf/Projects';
    const { data, error } = await supabase.from('sub_agent_execution_results').insert({
      sub_agent_code: SUB_AGENT_CODE, sub_agent_name: SUB_AGENT_CODE, verdict: 'PASS', confidence: 100,
      metadata: { repo_path: corrupted },
    }).select();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/reject_control_chars_in_subagent_evidence/);
    expect(error.message).toMatch(/metadata\.repo_path/);
  });

  it('rejects an INSERT with a control-char-corrupted metadata.executed_from_cwd', async () => {
    const corrupted = 'C:/Users/rickf' + String.fromCharCode(0x01) + '/Projects';
    const { data, error } = await supabase.from('sub_agent_execution_results').insert({
      sub_agent_code: SUB_AGENT_CODE, sub_agent_name: SUB_AGENT_CODE, verdict: 'PASS', confidence: 100,
      metadata: { repo_path: 'C:/Users/rickf/Projects', executed_from_cwd: corrupted },
    }).select();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/metadata\.executed_from_cwd/);
  });

  it('rejects an INSERT with a control-char-corrupted TOP-LEVEL executed_from_cwd column', async () => {
    // Regression coverage: the top-level executed_from_cwd column is a SEPARATE field from
    // metadata.executed_from_cwd, populated directly by several hand-typed one-off scripts
    // that bypass lib/sub-agents/resolve-repo.js entirely — must be covered independently.
    const corrupted = 'C:/Users/rickf' + String.fromCharCode(0x0A) + 'ode_modules';
    const { data, error } = await supabase.from('sub_agent_execution_results').insert({
      sub_agent_code: SUB_AGENT_CODE, sub_agent_name: SUB_AGENT_CODE, verdict: 'PASS', confidence: 100,
      executed_from_cwd: corrupted,
    }).select();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/(?<!metadata\.)executed_from_cwd/);
  });

  it('accepts a clean INSERT with control-char-free forward-slash paths in all 3 fields', async () => {
    const { data, error } = await supabase.from('sub_agent_execution_results').insert({
      sub_agent_code: SUB_AGENT_CODE, sub_agent_name: SUB_AGENT_CODE, verdict: 'PASS', confidence: 100,
      metadata: { repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer', executed_from_cwd: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer' },
      executed_from_cwd: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
    }).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    acceptedRowIds.push(data[0].id);
  });

  it('accepts a clean INSERT that omits metadata/executed_from_cwd entirely (no false-positive on absent fields)', async () => {
    const { data, error } = await supabase.from('sub_agent_execution_results').insert({
      sub_agent_code: SUB_AGENT_CODE, sub_agent_name: SUB_AGENT_CODE, verdict: 'PASS', confidence: 100,
    }).select();
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    acceptedRowIds.push(data[0].id);
  });
});
