import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..');
const BRAINSTORM = join(REPO_ROOT, '.claude', 'commands', 'brainstorm.md');

describe('brainstorm CFO persona Claude Code economics framing (QF-20260514-096)', () => {
  const src = readFileSync(BRAINSTORM, 'utf8');

  it('CFO standing question references API-token + user-supervisory-hour currency', () => {
    expect(src).toContain('API-token + user-supervisory-hour costs');
    expect(src).toMatch(/CFO:\s*"What are the API-token \+ user-supervisory-hour costs/);
  });

  it('CFO standing question explicitly rejects blended-rate engineer-hours framing', () => {
    expect(src).toMatch(/Claude Code economics.*NOT.*engineer-hours.*blended rate/i);
  });

  it('CFO addendum section present and references QF + memory entry', () => {
    expect(src).toContain('CFO seat addendum (QF-20260514-096');
    expect(src).toContain('feedback_cfo_persona_claude_code_economics.md');
  });

  it('addendum names the misleading $85K-style framing the chairman flagged', () => {
    expect(src).toContain('$85K');
    expect(src).toMatch(/chairman flagged/i);
  });

  it('Round 1 board-positions table CFO row uses Claude Code economics framing', () => {
    expect(src).toMatch(/\| CFO \| API-token \+ user-supervisory-hour costs/);
  });

  it('no $80-$200/hr-style blended-rate phrasing remains in CFO addendum', () => {
    // The addendum CALLS OUT the wrong framing as a "do NOT" — that's the only allowed match
    const matches = [...src.matchAll(/engineer hours \xD7 \$\d/gi)];
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
