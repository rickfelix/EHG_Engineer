/**
 * SD-LEO-INFRA-STAGE-CODE-QUALITY-001
 *
 * Unit tests for the four new repo-scannable Stage-20 canonical finding
 * categories added to the code-quality analyzer:
 *   QA:                unit_test, e2e_test
 *   Vision Compliance: feedback_widget_present, error_capture_wired  (absence = finding)
 *
 * Each detection function reads package.json from a synthetic fixture repo dir
 * (no clone, no DB, no network) so the tests are fully deterministic. Also
 * guards the legacy-adapter mapping so the new categories persist under their
 * own canonical category instead of collapsing into the 'capability' fallback.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  detectUnitTests,
  detectE2eTests,
  scanFeedbackWidget,
  scanErrorCapture,
} from '../../../lib/eva/stage-templates/analysis-steps/stage-20-code-quality.js';
import { adaptLegacyBatch } from '../../../lib/eva/quality-findings/legacy-adapter.js';

const createdDirs = [];

async function repoWithPackage(pkg) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 's20cq-'));
  createdDirs.push(dir);
  await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg ?? {}, null, 2), 'utf-8');
  return dir;
}

async function emptyDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 's20cq-nopkg-'));
  createdDirs.push(dir);
  return dir;
}

afterAll(async () => {
  for (const d of createdDirs) {
    try { await rm(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describe('Stage-20 analyzer — QA + Vision-Compliance categories', () => {
  it('detectUnitTests: absent runner -> medium finding; present -> no finding', async () => {
    const absent = await detectUnitTests(await repoWithPackage({ devDependencies: { eslint: '^9' } }));
    expect(absent).toHaveLength(1);
    expect(absent[0].check).toBe('unit_test');
    expect(absent[0].severity).toBe('medium');

    const present = await detectUnitTests(await repoWithPackage({ devDependencies: { vitest: '^4' } }));
    expect(present).toHaveLength(0);
  });

  it('detectE2eTests: absent -> low finding; present (@playwright/test) -> no finding', async () => {
    const absent = await detectE2eTests(await repoWithPackage({ devDependencies: {} }));
    expect(absent).toHaveLength(1);
    expect(absent[0].check).toBe('e2e_test');
    expect(absent[0].severity).toBe('low');

    const present = await detectE2eTests(await repoWithPackage({ devDependencies: { '@playwright/test': '^1' } }));
    expect(present).toHaveLength(0);
  });

  it('scanFeedbackWidget: no widget SDK -> finding; with LogRocket -> no finding', async () => {
    const absent = await scanFeedbackWidget(await repoWithPackage({ dependencies: { react: '^18' } }));
    expect(absent).toHaveLength(1);
    expect(absent[0].check).toBe('feedback_widget_present');
    expect(absent[0].severity).toBe('medium');

    const present = await scanFeedbackWidget(await repoWithPackage({ dependencies: { logrocket: '^8' } }));
    expect(present).toHaveLength(0);
  });

  it('scanErrorCapture: no error-capture SDK -> finding; with @sentry/react -> no finding', async () => {
    const absent = await scanErrorCapture(await repoWithPackage({ dependencies: { react: '^18' } }));
    expect(absent).toHaveLength(1);
    expect(absent[0].check).toBe('error_capture_wired');
    expect(absent[0].severity).toBe('medium');

    const present = await scanErrorCapture(await repoWithPackage({ dependencies: { '@sentry/react': '^8' } }));
    expect(present).toHaveLength(0);
  });

  it('no package.json -> info "undetectable" finding (graceful, not a hard failure)', async () => {
    const r = await scanErrorCapture(await emptyDir());
    expect(r).toHaveLength(1);
    expect(r[0].severity).toBe('info');
  });

  it('adaptLegacyBatch maps the 4 new categories to canonical (not the capability fallback)', () => {
    const legacy = [
      { check: 'unit_test', title: 'no runner', severity: 'medium' },
      { check: 'e2e_test', title: 'no e2e', severity: 'low' },
      { check: 'feedback_widget_present', title: 'no widget', severity: 'medium' },
      { check: 'error_capture_wired', title: 'no capture', severity: 'medium' },
    ];
    const { canonical } = adaptLegacyBatch(legacy, { venture_id: '00000000-0000-4000-8000-00000000abcd' });
    const cats = canonical.map((c) => c.finding_category).sort();
    expect(cats).toEqual(['e2e_test', 'error_capture_wired', 'feedback_widget_present', 'unit_test']);
    expect(cats).not.toContain('capability');
  });
});
