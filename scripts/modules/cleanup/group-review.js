/**
 * Cluster REVIEW items by inferred dirname + extension glob.
 *
 * Below the cluster-size threshold, items fall through to per-file REVIEW.
 * Pattern format mirrors existing rule patterns in .claude/cleanup-rules.json
 * so any cluster verdict can later be persisted as a learned rule.
 */

import path from 'path';

export const DEFAULT_MIN_CLUSTER_SIZE = 3;

function inferPattern(filePath) {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/$/, '');
  const dir = path.posix.dirname(normalized);
  const base = path.posix.basename(normalized);
  const ext = path.posix.extname(base);
  if (!ext) {
    return dir === '.' ? `/${base}` : `${dir}/${base}`;
  }
  return dir === '.' ? `/*${ext}` : `${dir}/*${ext}`;
}

export function groupReviewItems(items, options = {}) {
  const minSize = options.minSize ?? DEFAULT_MIN_CLUSTER_SIZE;
  if (!Array.isArray(items)) {
    return { clusters: new Map(), unclustered: [] };
  }

  const buckets = new Map();
  for (const item of items) {
    const file = typeof item === 'string' ? item : item?.file;
    if (!file) continue;
    const pattern = inferPattern(file);
    if (!buckets.has(pattern)) buckets.set(pattern, []);
    buckets.get(pattern).push(item);
  }

  const clusters = new Map();
  const unclustered = [];
  for (const [pattern, members] of buckets) {
    if (members.length >= minSize) {
      clusters.set(pattern, members);
    } else {
      unclustered.push(...members);
    }
  }
  return { clusters, unclustered };
}

export { inferPattern };
