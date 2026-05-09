// QF-20260509-ASSIST-PEER-LEAK: assist-engine context summary must NOT
// surface peer's is_working_on=true rows. Filter by CLAUDE_SESSION_ID.
// Closes feedback 1462a0a2.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const srcFile = path.join(repoRoot, 'lib/quality/context-analyzer.js');

describe('QF-20260509-ASSIST-PEER-LEAK: getRecentSDContext session scoping', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(srcFile, 'utf-8');
  });

  it('reads CLAUDE_SESSION_ID from env to scope is_working_on filter', () => {
    expect(src).toMatch(/process\.env\.CLAUDE_SESSION_ID/);
  });

  it('builds isWorkingOnFilter with claiming_session_id match when session present', () => {
    expect(src).toMatch(/claiming_session_id\.eq\.\$\{currentSessionId\}/);
    // Uses postgrest "and()" composition to AND the two conditions
    expect(src).toMatch(/and\(is_working_on\.eq\.true,claiming_session_id\.eq/);
  });

  it('falls back to plain is_working_on.eq.true when session not set (no regression for CLI inspectors)', () => {
    // Locate the function and check the fallback branch
    const idx = src.indexOf('async function getRecentSDContext');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/currentSessionId\s*\?[\s\S]+?:\s*['"]is_working_on\.eq\.true['"]/);
  });

  it('SELECT now includes claiming_session_id (consumers can re-verify scoping)', () => {
    const idx = src.indexOf('async function getRecentSDContext');
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/\.select\([^)]*claiming_session_id/);
  });

  it('regression-pin: plain unbounded `is_working_on.eq.true` is gone from the query path', () => {
    const idx = src.indexOf('async function getRecentSDContext');
    const block = src.slice(idx, idx + 1500);
    // The pre-fix pattern was `.or(\`is_working_on.eq.true,updated_at...\`)`
    // The post-fix pattern uses `${isWorkingOnFilter}` template var
    expect(block).toMatch(/\$\{isWorkingOnFilter\}/);
    // Must NOT have the pre-fix bare leading is_working_on.eq.true followed by comma
    expect(block).not.toMatch(/\.or\(`is_working_on\.eq\.true,updated_at/);
  });
});
