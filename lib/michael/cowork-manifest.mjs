// lib/michael/cowork-manifest.mjs — Step 0 freeze: manifest a folder before import, detect drift
// on a later run. SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-F (FR-1). Modeled on
// lib/evidence/manifest-generator.js's scanArtifacts (recursive walk)/hashFile (per-file SHA-256)
// shape; the folder lives on the chairman's host, outside repo/CI reach, so "freeze" here means
// "detect and refuse to proceed on drift," never a filesystem permission change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Recursively walk `baseDir`, returning [{path (relative, forward-slash), hash_sha256, size_bytes}]. Injectable `fsImpl` for tests. */
export function scanFolder(baseDir, { fsImpl = fs } = {}) {
  const files = [];
  const walk = (relPath) => {
    const fullPath = path.join(baseDir, relPath);
    const entries = fsImpl.readdirSync(fullPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(entryRel); continue; }
      if (!entry.isFile()) continue;
      const entryFull = path.join(baseDir, entryRel);
      const content = fsImpl.readFileSync(entryFull);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      files.push({ path: entryRel, hash_sha256: hash, size_bytes: content.length });
    }
  };
  walk('');
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return files;
}

/** Pure: an aggregate SHA-256 over the sorted file list (path+hash pairs), independent of hashFile's own I/O. */
export function aggregateHash(files) {
  const canonical = files.map((f) => `${f.path}:${f.hash_sha256}`).join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Build a manifest: { files, aggregate_hash, generated_at }. */
export function buildManifest(baseDir, { now = new Date(), fsImpl = fs } = {}) {
  const files = scanFolder(baseDir, { fsImpl });
  return { files, aggregate_hash: aggregateHash(files), generated_at: now.toISOString() };
}

/**
 * Compare a prior manifest against a freshly-scanned folder. Returns { drifted, added, removed,
 * changed } where each of added/removed/changed is an array of relative paths. Pure given two
 * manifest-shaped inputs (no I/O) — callers pass buildManifest()'s current output as `current`.
 */
export function diffManifest(prior, current) {
  const priorByPath = new Map((prior.files || []).map((f) => [f.path, f.hash_sha256]));
  const currentByPath = new Map((current.files || []).map((f) => [f.path, f.hash_sha256]));
  const added = [...currentByPath.keys()].filter((p) => !priorByPath.has(p));
  const removed = [...priorByPath.keys()].filter((p) => !currentByPath.has(p));
  const changed = [...currentByPath.keys()].filter((p) => priorByPath.has(p) && priorByPath.get(p) !== currentByPath.get(p));
  return { drifted: added.length > 0 || removed.length > 0 || changed.length > 0, added, removed, changed };
}
