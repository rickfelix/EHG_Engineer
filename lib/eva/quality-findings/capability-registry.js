/**
 * Capability registry for the Stage 20 Unified Quality Lifecycle Loop.
 *
 * SD: SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-E
 *
 * Each capability has a probe function that returns a { ok, version?, error? }
 * result. The capability gate (capability-gate.js) walks this registry and
 * fails closed on the first missing capability so the loop never runs with
 * stub data.
 *
 * Future capabilities can be added by appending to CAPABILITIES — the gate
 * picks them up without code changes (extensibility contract).
 *
 * @module lib/eva/quality-findings/capability-registry
 */

import { execSync } from 'child_process';

/**
 * Probe whether a CLI executable is on PATH.
 *
 * @param {string} cmd  - command name (e.g. "gh")
 * @returns {{ ok: boolean, version?: string, error?: string }}
 */
function probeCli(cmd) {
  try {
    const v = execSync(`${cmd} --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
    return { ok: true, version: v };
  } catch (err) {
    return { ok: false, error: `${cmd} not found on PATH` };
  }
}

/**
 * Probe whether a node module resolves at the expected path.
 *
 * @param {string} relPath - path relative to repo root (e.g. "lib/eva/quality-findings/writer.js")
 * @returns {{ ok: boolean, error?: string }}
 */
function probeModule(relPath) {
  try {
    // Use require.resolve via dynamic import to keep ESM-compatible.
    // For runtime detection we just stat the file — the gate's contract is
    // "the module exists and can be resolved", not "it imports successfully".
    const fs = require('fs');
    const path = require('path');
    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, error: `module not found: ${relPath}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Probe whether an env var is set (used for runner endpoints, bug-tracker
 * tokens, etc).
 *
 * @param {string} envVar
 * @returns {{ ok: boolean, error?: string }}
 */
function probeEnv(envVar) {
  if (process.env[envVar]) return { ok: true };
  return { ok: false, error: `env var ${envVar} not set` };
}

/**
 * Required capabilities for the Stage 20 unified quality loop.
 *
 * The 5 capabilities (per Component E's scope expansion vs the original
 * cross-stage premise) are: gh CLI, sandbox container, structured-finding
 * writer, UAT runner, bug-tracker integration.
 *
 * Each entry: { name, kind, probe, optional?, expand? }
 *  - optional=true means missing capability is a warning, not a hard fail
 *    (gate's caller decides whether to enforce). Used for capabilities
 *    that aren't universally available (UAT runner on dev machines).
 */
export const CAPABILITIES = Object.freeze([
  {
    name: 'gh-cli',
    kind: 'cli',
    description: 'GitHub CLI for PR/SD interactions',
    probe: () => probeCli('gh'),
    optional: false,
  },
  {
    name: 'sandbox-runtime',
    kind: 'cli',
    description: 'Sandbox runtime (node + git for cloned-repo execution per Component D)',
    probe: () => {
      const node = probeCli('node');
      const git = probeCli('git');
      if (!node.ok) return node;
      if (!git.ok) return git;
      return { ok: true, version: `node ${node.version}; git ${git.version}` };
    },
    optional: false,
  },
  {
    name: 'finding-writer',
    kind: 'module',
    description: 'Component B writer module for venture_quality_findings',
    probe: () => probeModule('lib/eva/quality-findings/writer.js'),
    optional: false,
  },
  {
    name: 'uat-runner',
    kind: 'env',
    description: 'UAT runner endpoint (env var UAT_RUNNER_URL)',
    probe: () => probeEnv('UAT_RUNNER_URL'),
    optional: true,  // not all dev environments have a UAT runner
  },
  {
    name: 'bug-tracker',
    kind: 'env',
    description: 'Bug-tracker integration token (env var BUG_TRACKER_TOKEN)',
    probe: () => probeEnv('BUG_TRACKER_TOKEN'),
    optional: true,  // chairman dashboard reads bug_reports directly when token absent
  },
]);

export { probeCli, probeModule, probeEnv };
