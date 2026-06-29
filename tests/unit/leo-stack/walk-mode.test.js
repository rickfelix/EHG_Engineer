/**
 * SD-LEO-INFRA-RESTART-RESPECTS-DAEMON-DOWN-WALK-001 — leo-stack must respect an active daemon-down
 * controlled walk: the sentinel holds the EVA stage workers stopped across a restart so the daemon
 * can't auto-advance a venture past S8 / S10. This pins the decision helper both shell scripts share.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const require = createRequire(import.meta.url);
const wm = require('../../../lib/leo-stack/walk-mode.cjs');
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('isEvaStageWorker — classifies the real registry as the daemon set', () => {
  it('every worker in the live config/workers.json is an EVA stage worker', () => {
    const workers = wm.readWorkerRegistry(REPO_ROOT);
    expect(workers.length).toBeGreaterThan(0);
    for (const w of workers) {
      expect(wm.isEvaStageWorker(w), `${w.id || w.command} should classify as EVA`).toBe(true);
    }
  });

  it('a synthetic non-EVA worker (e.g. a web server) is NOT an EVA stage worker', () => {
    expect(wm.isEvaStageWorker({ id: 'engineer-web', command: 'node server.js' })).toBe(false);
    expect(wm.isEvaStageWorker({ id: 'app', command: 'npm run dev' })).toBe(false);
  });
});

describe('shouldStartWorker — gate only the daemon set, only during a walk', () => {
  const eva = { id: 'stage-execution-worker', command: 'node scripts/start-stage-worker.js' };
  const web = { id: 'engineer-web', command: 'node server.js' };

  it('EVA worker is held stopped only when a walk is active', () => {
    expect(wm.shouldStartWorker(eva, true)).toBe(false);
    expect(wm.shouldStartWorker(eva, false)).toBe(true);
  });
  it('non-EVA worker always starts, even during a walk', () => {
    expect(wm.shouldStartWorker(web, true)).toBe(true);
    expect(wm.shouldStartWorker(web, false)).toBe(true);
  });
});

describe('isWalkModeActive + skipWorkerIds — sentinel-driven', () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(join(os.tmpdir(), 'walkmode-'));
    fs.mkdirSync(join(tmp, 'config'));
    // SD-LEO-INFRA-LEO-STACK-PS-ENCODING-WALKMODE-FIX-001 FR-2: the REAL config/workers.json keys on
    // `name` (there is NO `id` field). The prior fixture used `id:`, which made skipWorkerIds return the
    // id and hid that the leo-stack.ps1/.sh consumers compared the non-existent worker.id (the skip was
    // inert in production while this test stayed green). Mirror the production schema here.
    fs.writeFileSync(join(tmp, 'config', 'workers.json'), JSON.stringify([
      { name: 'stage-zero-processor', command: 'node scripts/stage-zero-queue-processor.js', enabled: true },
      { name: 'stage-execution-worker', command: 'node scripts/start-stage-worker.js', enabled: true },
      { name: 'eva-master-scheduler', command: 'node lib/eva/eva-master-scheduler.js', enabled: false },
      { name: 'web-server', command: 'node server.js', enabled: true },
    ]));
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('inactive without the sentinel → skip-ids is empty', () => {
    expect(wm.isWalkModeActive(tmp)).toBe(false);
    expect(wm.skipWorkerIds(tmp)).toEqual([]);
  });

  it('active with the sentinel → skip-ids lists the EVA workers, NOT the web server', () => {
    fs.writeFileSync(join(tmp, wm.WALK_SENTINEL_FILE), '');
    expect(wm.isWalkModeActive(tmp)).toBe(true);
    const skip = wm.skipWorkerIds(tmp);
    expect(skip).toContain('stage-zero-processor');
    expect(skip).toContain('stage-execution-worker');
    expect(skip).toContain('eva-master-scheduler');
    expect(skip).not.toContain('web-server');
  });
});
