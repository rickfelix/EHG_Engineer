import { readFileSync } from 'node:fs';

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;
const KV_RE = /^(\w[\w_-]*)\s*:\s*(.+)$/;
const SHORT_SHA_LEN = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseYamlBlock(yamlContent) {
  const out = {};
  for (const line of yamlContent.split('\n')) {
    const trimmed = line.replace(/\s+$/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;
    const kv = trimmed.match(KV_RE);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[kv[1]] = value;
  }
  return out;
}

function daysBetween(fromDate, toDate) {
  if (!fromDate || isNaN(fromDate.getTime())) return null;
  if (!toDate || isNaN(toDate.getTime())) return null;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
}

export function parseMemoryFrontmatter(filePath, { now = new Date() } = {}) {
  const content = readFileSync(filePath, 'utf8');
  const match = content.match(FRONTMATTER_RE);
  const raw = match ? parseYamlBlock(match[1]) : {};

  const result = {
    name: raw.name || null,
    description: raw.description || null,
    type: raw.type || null,
    verified_against: raw.verified_against || null,
    verified_at: raw.verified_at || null,
    specificity: raw.specificity || null,
    expires_at: raw.expires_at || null,
    is_expired: false,
    verification_age_days: null,
  };

  if (result.expires_at) {
    const expiresDate = new Date(result.expires_at);
    if (!isNaN(expiresDate.getTime())) {
      result.is_expired = expiresDate.getTime() < now.getTime();
    }
  }

  if (result.verified_at) {
    const verifiedDate = new Date(result.verified_at);
    result.verification_age_days = daysBetween(verifiedDate, now);
  }

  return result;
}

function shortSha(sha) {
  if (!sha || typeof sha !== 'string') return null;
  return sha.toLowerCase().slice(0, SHORT_SHA_LEN);
}

export function formatMemoryCitation(memory) {
  const title = (memory && memory.name) ? memory.name : '(untitled memory)';
  if (!memory) return title;

  if (memory.is_expired) {
    return `${title} (!) verification expired`;
  }

  if (memory.verified_against && memory.verification_age_days !== null) {
    return `${title} (verified against ${shortSha(memory.verified_against)}, ${memory.verification_age_days}d ago)`;
  }

  return title;
}
