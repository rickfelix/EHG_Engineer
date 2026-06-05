import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * QF-20260604-723 — auto-learning-capture hook retired.
 *
 * The inserter (scripts/auto-learning-capture.js) was archived ~2026-04-23, leaving the
 * PostToolUse hook spawning a missing script (silent ENOENT) while printing a false
 * "learning captured" banner on every non-SD merge. DB footprint was zero
 * (retro_type=NON_SD_CAPTURE: 0 rows; generated_by=AUTO_HOOK: 0 rows) with no live consumers,
 * so the hook was unregistered and its .cjs archived alongside the inserter.
 *
 * Guards against accidental re-registration / un-archival.
 */
const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

describe('auto-learning-capture hook is retired (QF-20260604-723)', () => {
  it('is not registered in .claude/settings.json', () => {
    const raw = readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8');
    expect(raw).not.toContain('auto-learning-capture');
    // settings.json must still be valid JSON after the hook removal
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('the live hook script no longer exists under scripts/hooks/', () => {
    expect(existsSync(path.join(ROOT, 'scripts', 'hooks', 'auto-learning-capture.cjs'))).toBe(false);
  });

  it('the dead hook + inserter are co-located in the archive', () => {
    expect(existsSync(path.join(ROOT, 'scripts', 'archive', 'one-time', 'auto-learning-capture.cjs'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'scripts', 'archive', 'one-time', 'auto-learning-capture.js'))).toBe(true);
  });
});
