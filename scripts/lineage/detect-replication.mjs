// scripts/lineage/detect-replication.mjs
// Sibling F FR-F-2: bypass-verb replication detector (CISO HIGH attack vector closure).
// Warn-only default; ENFORCE_REPLICATION_DETECTOR=true flips to BLOCKING after 14-day soak.

const DENY_LIST = [
  'bypass_validation',
  '--bypass-validation',
  '--bypass-reason',
  'bypass-rubric',
  'EMERGENCY_PUSH',
  'EMERGENCY_RCA_BYPASS',
  '--no-verify',
];

const DEFAULT_EXEMPT_PATHS = [
  'scripts/one-off/',
  'tests/',
  'docs/retrospectives/',
  'docs/plans/archived/',
  'scripts/lineage/detect-replication.mjs',
  '__tests__/',
];

function isExempt(path, exemptPaths = DEFAULT_EXEMPT_PATHS) {
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/');
  return exemptPaths.some(prefix => normalized.includes(prefix));
}

export function detectReplication({ content, path = null, options = {} } = {}) {
  if (typeof content !== 'string') {
    return { flagged: false, matches: [], exempt: false, reason: 'no content provided' };
  }

  const exemptPaths = options.exemptPaths || DEFAULT_EXEMPT_PATHS;
  const exempt = isExempt(path, exemptPaths);

  const matches = [];
  for (const verb of DENY_LIST) {
    const idx = content.indexOf(verb);
    if (idx >= 0) {
      matches.push({ verb, index: idx, line: content.slice(0, idx).split('\n').length });
    }
  }

  const flagged = matches.length > 0;
  const enforce = (options.enforce ?? (process.env.ENFORCE_REPLICATION_DETECTOR === 'true'));

  if (flagged && !exempt && enforce) {
    const err = new Error(`Replication detector BLOCKED ${matches.length} bypass-verb match(es) in ${path || 'content'}: ${matches.map(m => m.verb).join(', ')}`);
    err.code = 'REPLICATION_DETECTED';
    err.matches = matches;
    throw err;
  }

  return { flagged, matches, exempt, mode: enforce ? 'BLOCKING' : 'WARN-ONLY' };
}

export const _internals = { DENY_LIST, DEFAULT_EXEMPT_PATHS };
