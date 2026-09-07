// QF-20260906-831 — preventive exit predicate: a needs_model=false loop must never be
// registered as a harness cron (one model turn burned per run for zero reasoning, measured
// 565 runs/week on index-jam-detector before this fix). This makes the next observational
// loop's mis-registration visible at PR time rather than after hundreds of runs.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'config', 'armed-loops-registry.json');
const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

describe('armed-loops-registry', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(registry)).toBe(true);
    expect(registry.length).toBeGreaterThan(0);
  });

  it('every entry declares loop_key, script, venue, needs_model (boolean), justification', () => {
    for (const loop of registry) {
      expect(typeof loop.loop_key).toBe('string');
      expect(loop.loop_key.length).toBeGreaterThan(0);
      expect(typeof loop.script).toBe('string');
      expect(['task_scheduler', 'harness_cron']).toContain(loop.venue);
      expect(typeof loop.needs_model).toBe('boolean');
      expect(typeof loop.justification).toBe('string');
      expect(loop.justification.length).toBeGreaterThan(0);
    }
  });

  it('QF-20260906-831 exit predicate: no needs_model=false loop is registered as a harness cron', () => {
    for (const loop of registry) {
      if (loop.needs_model === false) {
        expect(
          loop.venue,
          `${loop.loop_key} is needs_model=false but venue is 'harness_cron' — observational loops must run on task_scheduler, never burn a model turn`
        ).not.toBe('harness_cron');
      }
    }
  });

  it('loop_key values are unique', () => {
    const keys = registry.map((l) => l.loop_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('index-jam-detector is registered on task_scheduler, not harness cron (QF-20260906-831)', () => {
    const entry = registry.find((l) => l.loop_key === 'index-jam-detector');
    expect(entry).toBeDefined();
    expect(entry.venue).toBe('task_scheduler');
    expect(entry.needs_model).toBe(false);
  });
});
