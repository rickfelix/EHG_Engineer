/**
 * QF-20260705-303 — session-register.cjs upserted a nonexistent `started_at`
 * column into claude_sessions (the live schema only has created_at/updated_at),
 * causing PostgREST to reject the upsert. The surrounding main().catch(() => {})
 * swallowed that error silently, so every new session's SessionStart registration
 * failed invisibly.
 *
 * The hook's main() auto-invokes at require-time and talks to live Supabase, so
 * we use static-string regression pins (same convention as
 * tests/unit/session-start-hook-reconcile.test.js) rather than importing it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.resolve(__dirname, '..', '..', 'scripts', 'hooks', 'session-register.cjs');

describe('QF-20260705-303: session-register no longer writes nonexistent started_at column', () => {
  let hookSource;

  it('reads the hook source once', () => {
    hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource.length).toBeGreaterThan(500);
  });

  it('the claude_sessions upsert payload no longer includes started_at', () => {
    hookSource = fs.readFileSync(hookPath, 'utf8');
    const payloadMatch = hookSource.match(/const payload = stampBranch\(\{[\s\S]*?\}\);/);
    expect(payloadMatch).not.toBeNull();
    expect(payloadMatch[0]).not.toMatch(/started_at/);
  });

  it('a failed upsert is surfaced to stderr, not silently ignored', () => {
    hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).toMatch(/if \(!error\) \{[\s\S]*?\} else \{[\s\S]*?process\.stderr\.write\([\s\S]*?upsert\.failed/);
  });

  it('main().catch() surfaces the error to stderr instead of failing silently', () => {
    hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).not.toMatch(/main\(\)\.catch\(\(\) => \{\s*\/\*\s*fail silently\s*\*\/\s*\}\);/);
    expect(hookSource).toMatch(/main\(\)\.catch\(\(err\) => \{[\s\S]*?process\.stderr\.write\([\s\S]*?main\.failed/);
  });

  it('regression-pin: fix references QF-20260705-303', () => {
    hookSource = fs.readFileSync(hookPath, 'utf8');
    expect(hookSource).toMatch(/QF-20260705-303|started_at column removal/);
  });
});
