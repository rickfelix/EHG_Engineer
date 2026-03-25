/**
 * GitHub Artifact Fetcher
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-H
 *
 * Fetches CI/CD artifacts from venture GitHub Actions runs and feeds
 * them into the build-feedback-collector + test-evidence-ingest pipelines.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { collectBuildFeedback } from './build-feedback-collector.js';

const GITHUB_API = 'https://api.github.com';
const ARTIFACT_NAMES = ['test-results', 'playwright-report', 'coverage'];

/**
 * Fetch the latest successful workflow run for a repo.
 * @param {string} repoFullName - e.g. "owner/repo"
 * @param {string} [token] - GitHub token (defaults to GITHUB_TOKEN env)
 * @returns {Promise<{ data: object|null, error: string|null }>}
 */
export async function fetchLatestWorkflowRun(repoFullName, token) {
  const ghToken = token || process.env.GITHUB_TOKEN;
  if (!ghToken) return { data: null, error: 'GITHUB_TOKEN not set' };

  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const url = `${GITHUB_API}/repos/${repoFullName}/actions/runs?status=completed&per_page=5`;
    const res = await fetch(url, { headers });

    if (res.status === 403) {
      const remaining = res.headers.get('X-RateLimit-Remaining');
      if (remaining === '0') {
        const resetAt = new Date(parseInt(res.headers.get('X-RateLimit-Reset')) * 1000);
        return { data: null, error: `GitHub API rate limited. Resets at ${resetAt.toISOString()}` };
      }
      return { data: null, error: 'GitHub API 403: check token permissions (needs actions:read)' };
    }

    if (res.status === 404) return { data: null, error: `Repository not found: ${repoFullName}` };
    if (!res.ok) return { data: null, error: `GitHub API error: ${res.status} ${res.statusText}` };

    const body = await res.json();
    const runs = body.workflow_runs || [];

    // Prefer the latest successful run with conclusion=success
    const successRun = runs.find(r => r.conclusion === 'success') || runs[0];
    if (!successRun) return { data: null, error: `No workflow runs found for ${repoFullName}` };

    return { data: successRun, error: null };
  } catch (err) {
    return { data: null, error: `Failed to fetch workflow runs: ${err.message}` };
  }
}

/**
 * Fetch artifact list for a workflow run.
 * @param {string} repoFullName
 * @param {number} runId - Workflow run ID
 * @param {string} [token]
 * @returns {Promise<{ data: object[]|null, error: string|null }>}
 */
export async function fetchRunArtifacts(repoFullName, runId, token) {
  const ghToken = token || process.env.GITHUB_TOKEN;
  if (!ghToken) return { data: null, error: 'GITHUB_TOKEN not set' };

  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const url = `${GITHUB_API}/repos/${repoFullName}/actions/runs/${runId}/artifacts`;
    const res = await fetch(url, { headers });
    if (!res.ok) return { data: null, error: `Failed to fetch artifacts: ${res.status}` };

    const body = await res.json();
    return { data: body.artifacts || [], error: null };
  } catch (err) {
    return { data: null, error: `Artifact fetch error: ${err.message}` };
  }
}

/**
 * Download a single artifact zip and extract it.
 * @param {string} downloadUrl - GitHub artifact download URL
 * @param {string} destDir - Directory to extract into
 * @param {string} [token]
 * @returns {Promise<{ success: boolean, files: string[], error: string|null }>}
 */
export async function downloadAndExtractArtifact(downloadUrl, destDir, token) {
  const ghToken = token || process.env.GITHUB_TOKEN;
  if (!ghToken) return { success: false, files: [], error: 'GITHUB_TOKEN not set' };

  try {
    const res = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
      },
      redirect: 'follow',
    });

    if (!res.ok) return { success: false, files: [], error: `Download failed: ${res.status}` };

    const buffer = Buffer.from(await res.arrayBuffer());

    // GitHub artifacts are zip files - use Node's built-in zlib for simple cases
    // For real zip extraction, write the buffer and use a zip library
    const zipPath = path.join(destDir, 'artifact.zip');
    fs.writeFileSync(zipPath, buffer);

    // Use unzip command if available, otherwise just save the raw zip
    const { execSync } = await import('child_process');
    try {
      execSync(`tar -xf "${zipPath}" -C "${destDir}" 2>/dev/null || unzip -o "${zipPath}" -d "${destDir}" 2>/dev/null || powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch {
      // If extraction fails, the zip file is still available
      return { success: false, files: [zipPath], error: 'Zip extraction failed - raw zip saved' };
    }

    // Remove the zip after extraction
    try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

    const files = fs.readdirSync(destDir).filter(f => f !== 'artifact.zip');
    return { success: true, files, error: null };
  } catch (err) {
    return { success: false, files: [], error: `Download error: ${err.message}` };
  }
}

/**
 * Fetch GitHub Actions artifacts and map to local file paths for collectBuildFeedback.
 * @param {string} repoFullName - e.g. "owner/repo"
 * @param {string} [token]
 * @returns {Promise<{ artifactPaths: object, tmpDir: string, warnings: string[] }>}
 */
export async function fetchGitHubArtifacts(repoFullName, token) {
  const warnings = [];
  const artifactPaths = {};
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venture-artifacts-'));

  // Step 1: Get latest workflow run
  const { data: run, error: runErr } = await fetchLatestWorkflowRun(repoFullName, token);
  if (runErr) {
    cleanupTmpDir(tmpDir);
    return { artifactPaths: {}, tmpDir: null, warnings: [runErr] };
  }

  // Step 2: Get artifacts for that run
  const { data: artifacts, error: artErr } = await fetchRunArtifacts(repoFullName, run.id, token);
  if (artErr) {
    cleanupTmpDir(tmpDir);
    return { artifactPaths: {}, tmpDir: null, warnings: [artErr] };
  }

  if (!artifacts.length) {
    cleanupTmpDir(tmpDir);
    return { artifactPaths: {}, tmpDir: null, warnings: [`No artifacts in workflow run ${run.id}`] };
  }

  // Step 3: Download and extract each known artifact
  for (const art of artifacts) {
    const name = art.name.toLowerCase();
    const artDir = path.join(tmpDir, art.name);
    fs.mkdirSync(artDir, { recursive: true });

    if (art.expired) {
      warnings.push(`Artifact "${art.name}" has expired`);
      continue;
    }

    const { success, files, error: dlErr } = await downloadAndExtractArtifact(
      art.archive_download_url, artDir, token
    );

    if (!success) {
      warnings.push(dlErr || `Failed to extract ${art.name}`);
      continue;
    }

    // Map artifact names to collectBuildFeedback paths
    if (name.includes('test-result') || name.includes('vitest')) {
      const jsonFile = files.find(f => f.endsWith('.json'));
      if (jsonFile) artifactPaths.vitestJson = path.join(artDir, jsonFile);
    } else if (name.includes('playwright')) {
      const jsonFile = files.find(f => f.endsWith('.json'));
      if (jsonFile) artifactPaths.playwrightReport = path.join(artDir, jsonFile);
    } else if (name.includes('coverage') || name.includes('lcov')) {
      const lcovFile = files.find(f => f.includes('lcov') || f.endsWith('.info'));
      if (lcovFile) artifactPaths.lcovInfo = path.join(artDir, lcovFile);
    }
  }

  return { artifactPaths, tmpDir, warnings };
}

/**
 * Clean up a temporary directory.
 * @param {string} dirPath
 */
function cleanupTmpDir(dirPath) {
  if (!dirPath) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
}

// --- Orchestrator ---

/**
 * Ingest venture test results from GitHub Actions.
 * Fetches artifacts, parses via collectBuildFeedback, optionally stores via ingestTestEvidence.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} repoFullName - GitHub repo (e.g. "owner/repo")
 * @param {object} [options]
 * @param {string} [options.token] - GitHub token override
 * @param {number} [options.lifecycleStage=20] - Target lifecycle stage
 * @param {boolean} [options.skipWrite=false] - Parse only, skip database writes
 * @returns {Promise<{ success: boolean, data: object, warnings: string[] }>}
 */
export async function ingestVentureTestResults(ventureId, repoFullName, options = {}) {
  const { token, lifecycleStage = 20, skipWrite = false } = options;
  let tmpDir = null;

  try {
    // Step 1: Fetch artifacts from GitHub
    const fetchResult = await fetchGitHubArtifacts(repoFullName, token);
    tmpDir = fetchResult.tmpDir;
    const allWarnings = [...fetchResult.warnings];

    const hasArtifacts = Object.keys(fetchResult.artifactPaths).length > 0;
    if (!hasArtifacts) {
      return {
        success: false,
        data: { unit_tests: null, e2e_tests: null, coverage: null },
        warnings: allWarnings.length ? allWarnings : ['No matching artifacts found in workflow run'],
      };
    }

    // Step 2: Parse via existing collectBuildFeedback
    const result = await collectBuildFeedback(ventureId, fetchResult.artifactPaths, {
      lifecycleStage,
      skipWrite,
    });

    return {
      success: result.success,
      data: result.data,
      warnings: [...allWarnings, ...result.warnings],
    };
  } finally {
    // Step 3: Always clean up temp files
    cleanupTmpDir(tmpDir);
  }
}
