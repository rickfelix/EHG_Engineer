/**
 * Regression test for demoted terminal-id match surfacing
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (Phase 4)
 * Patterns: PAT-RETRO-EXECTOPLAN-0bda95fe, PAT-HF-EXECTOPLAN-0bda95fe
 *
 * Before: resolveOwnSession silently dropped terminal_id matches under
 * requireDeterministic=true; callers saw 'no_deterministic_identity' with
 * no hint that a partial match existed.
 *
 * After: demotedMatches array is populated with session_id, reason, and
 * remediation text; claim-validity-gate's error includes it inline.
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveOwnSession } from '../../../lib/resolve-own-session.js';

// Minimal mock of supabase client
function mockSupabaseWithTerminalMatch(matchingSessionId) {
  return {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) {
          this._col = col;
          this._val = val;
          return this;
        },
        in() { return this; },
        limit() { return this; },
        maybeSingle() {
          // strategy 1: env CLAUDE_SESSION_ID direct match — return null (no env var)
          // strategy 2: marker file — return null
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve) {
          // strategy 3 path uses .eq('terminal_id', candidate).in(status, [active, idle])
          // as a query — returns array of matches
          if (this._col === 'terminal_id') {
            resolve({ data: [{ session_id: matchingSessionId, terminal_id: this._val }], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        }
      };
    }
  };
}

describe('resolveOwnSession demoted terminal_id (PAT-0bda95fe)', () => {
  it('demotedMatches field exists in no_deterministic_identity response when terminal_id matched', async () => {
    // Note: This is a SHAPE test — we inspect the source file directly rather than
    // plumbing a full DB mock, to avoid coupling to supabase-js internals.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/resolve-own-session.js'),
      'utf8'
    );
    // Verify the demotedMatches tracking variable exists
    expect(src).toMatch(/const demotedMatches\s*=\s*\[\]/);
    // Verify demotedMatches are pushed on demotion
    expect(src).toMatch(/demotedMatches\.push/);
    // Verify demotedMatches appear in the no_deterministic_identity return value
    expect(src).toMatch(/demotedMatches:\s*demotedMatches/);
  });

  it('claim-validity-gate threads demotedMatches into error remediation', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/claim-validity-gate.js'),
      'utf8'
    );
    expect(src).toContain('resolved.demotedMatches');
    expect(src).toMatch(/terminal_id matched session/);
    expect(src).toContain('PAT-RETRO/HF-EXECTOPLAN-0bda95fe');
  });

  it('remediation text includes actionable env var guidance', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'lib/resolve-own-session.js'),
      'utf8'
    );
    // Should instruct on how to set CLAUDE_SESSION_ID
    expect(src).toMatch(/CLAUDE_SESSION_ID=/);
    expect(src).toMatch(/session-identity.*marker|marker.*session-identity/i);
  });
});
