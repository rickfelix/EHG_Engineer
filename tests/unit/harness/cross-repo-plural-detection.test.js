// QF-20260509-CROSS-REPO-PLURAL: sub-agent-orchestration cross-repo skip path
// must honor BOTH metadata.target_repo (singular) AND metadata.target_repos
// (plural array). 6th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
// Closes feedback 45f3e446.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const gateFile = path.join(repoRoot, 'scripts/modules/handoff/executors/exec-to-plan/gates/sub-agent-orchestration.js');

describe('QF-20260509-CROSS-REPO-PLURAL: sub-agent-orchestration cross-repo plural array support', () => {
  it('source reads metadata.target_repos plural array', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    expect(src).toMatch(/metadata\?\.target_repos/);
    expect(src).toMatch(/Array\.isArray\(ctx\.sd\?\.metadata\?\.target_repos\)/);
  });

  it('source reads metadata.target_repo singular as fallback', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    expect(src).toMatch(/metadata\?\.target_repo[^s]/); // singular, not plural prefix
  });

  it('source defines isExternalRepo helper that excludes EHG_Engineer + rickfelix/EHG_Engineer', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    expect(src).toMatch(/isExternalRepo/);
    expect(src).toMatch(/'EHG_Engineer'/);
    expect(src).toMatch(/'rickfelix\/EHG_Engineer'/);
  });

  it('source uses .find on plural array to detect first external repo', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    // The plural-array branch must use .find with isExternalRepo
    expect(src).toMatch(/targetReposArray\.find\(isExternalRepo\)/);
  });

  it('singular and plural detection both flow into the same skip-path return', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    // After detection, the if-block must check externalSingular || externalPlural via the unified targetRepo var
    expect(src).toMatch(/const targetRepo\s*=\s*externalSingular\s*\|\|\s*externalPlural/);
    expect(src).toMatch(/if \(targetRepo\)\s*\{/);
  });

  it('regression: pre-fix singular-only check is gone', () => {
    const src = fs.readFileSync(gateFile, 'utf-8');
    // The OLD pattern was: `if (targetRepo && targetRepo !== 'EHG_Engineer' && targetRepo !== 'rickfelix/EHG_Engineer')`
    // The NEW pattern is: `if (targetRepo) {` after combining singular+plural via isExternalRepo helper.
    // We pin: there must be no inline guard on the post-combined check
    const ifMatch = src.match(/if \(targetRepo &&[^)]*'EHG_Engineer'[^)]*'rickfelix/);
    expect(ifMatch).toBeNull();
  });
});
