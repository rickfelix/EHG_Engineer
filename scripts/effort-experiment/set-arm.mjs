#!/usr/bin/env node
/**
 * set-arm.mjs — coordinator records a worker session's effort arm
 * (SD-MAN-INFRA-EFFORT-TIER-EXPERIMENT-001 FR-3).
 *
 * Effort is a session-level OPERATOR setting invisible to code (verified at
 * LEAD: /effort appears nowhere in transcript JSONL or env), so arms are
 * RECORDED at worker launch, never detected. The FR-1 completion stamp reads
 * this key back into each SD's metadata.execution_context.effort_arm.
 *
 * Usage:
 *   node scripts/effort-experiment/set-arm.mjs <session_id> <xhigh|high|medium> [--shift day|night]
 */
import dotenv from 'dotenv';
dotenv.config();

const ARMS = ['xhigh', 'high', 'medium'];

export async function setArm(supabase, sessionId, arm, { shift = null, setBy = null } = {}) {
  if (!ARMS.includes(arm)) return { ok: false, error: `arm must be one of ${ARMS.join('|')}` };
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `session not found: ${sessionId}` };
  const md = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  md.effort_arm = arm;
  md.arm_set_at = new Date().toISOString();
  md.arm_set_by = setBy || process.env.CLAUDE_SESSION_ID || 'cli';
  if (shift) md.arm_shift = shift;
  const { error: werr } = await supabase
    .from('claude_sessions')
    .update({ metadata: md })
    .eq('session_id', sessionId);
  if (werr) return { ok: false, error: werr.message };
  return { ok: true, session_id: sessionId, effort_arm: arm, arm_shift: shift || null };
}

async function main() {
  const [sessionId, arm] = process.argv.slice(2);
  const shiftIdx = process.argv.indexOf('--shift');
  const shift = shiftIdx >= 0 ? process.argv[shiftIdx + 1] : null;
  if (!sessionId || !arm) {
    console.error('Usage: set-arm.mjs <session_id> <xhigh|high|medium> [--shift day|night]');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const res = await setArm(supabase, sessionId, arm, { shift });
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}

import path from 'path';
const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (isMain) main().catch(e => { console.error(e.message); process.exit(1); });
