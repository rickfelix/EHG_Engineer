#!/usr/bin/env node
/**
 * Fleet Commit Trailer (QF-20260703-311)
 *
 * All fleet worker sessions commit under the same git author identity, so a
 * worker seeing a peer's commit on a shared/moved-claim branch reads it as an
 * unattributed background actor. Appends a trailer identifying the current
 * session's fleet callsign so peer commits are attributable at a glance.
 * Author identity is left unchanged for GitHub attribution — trailer-only.
 *
 * Usage: node scripts/append-fleet-commit-trailer.js <commit-msg-file>
 *
 * Fail-open: any missing env var, DB error, or timeout exits 0 silently —
 * this is cosmetic metadata, never a reason to block a commit.
 */

import fs from 'fs';

async function main() {
  const msgFile = process.argv[2];
  const sessionId = process.env.CLAUDE_SESSION_ID;
  if (!msgFile || !sessionId) process.exit(0);

  try {
    const { createSupabaseServiceClient } = await import('../lib/supabase-client.js');
    const supabase = createSupabaseServiceClient();

    const timeoutMs = 2000;
    const result = await Promise.race([
      supabase
        .from('claude_sessions')
        .select('metadata')
        .eq('session_id', sessionId)
        .maybeSingle(),
      new Promise((resolve) => setTimeout(() => resolve({ data: null, timedOut: true }), timeoutMs)),
    ]);

    const callsign = result?.data?.metadata?.fleet_identity?.callsign;
    if (!callsign) process.exit(0);

    const message = fs.readFileSync(msgFile, 'utf8');
    const trailer = `Fleet-Worker: ${callsign}\nClaude-Session: ${sessionId}`;
    if (message.includes('Fleet-Worker:')) process.exit(0); // already stamped (amend/retry)
    fs.writeFileSync(msgFile, `${message.replace(/\s*$/, '')}\n\n${trailer}\n`);
  } catch {
    // Fail-open — never block a commit over attribution metadata.
  }
  process.exit(0);
}

main();
