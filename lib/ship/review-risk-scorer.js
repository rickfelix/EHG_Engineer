/**
 * Composite Risk Scorer for /ship Review Gate
 *
 * Classifies PRs into Light/Standard/Deep tiers using weighted signals:
 *   LOC: 30%, Risk Surface: 35%, SD Tier: 20%, Change Type: 15%
 *
 * Risk keywords (auth, migration, schema, feature) always force Deep tier.
 */

const RISK_KEYWORDS = ['auth', 'rls', 'security', 'migration', 'schema', 'credential', 'permission', 'service_role', 'service-role'];

const RISK_FILE_PATTERNS = [
  /\bauth\b/i, /\brls\b/i, /\bsecurity\b/i,
  /\bmigrat/i, /\bschema\b/i, /\bcredential/i,
  /\bpermission/i, /service.?role/i
];

const WEIGHTS = { loc: 0.30, riskSurface: 0.35, sdTier: 0.20, changeType: 0.15 };

const TIER_THRESHOLDS = {
  light:    { maxLoc: 30, maxFiles: 3, maxSdTier: 1 },
  standard: { maxLoc: 150, maxFiles: 8, maxSdTier: 2 },
  // Deep = anything above standard thresholds or risk keyword match
};

/**
 * Score LOC dimension (0-1, higher = riskier)
 */
function scoreLoc(loc) {
  if (loc <= 30) return 0.1;
  if (loc <= 75) return 0.3;
  if (loc <= 150) return 0.6;
  return 1.0;
}

/**
 * Score risk surface dimension based on file count and risk file matches (0-1)
 */
function scoreRiskSurface(files) {
  const fileCount = files.length;
  const riskFileCount = files.filter(f => RISK_FILE_PATTERNS.some(p => p.test(f))).length;

  let fileScore = 0;
  if (fileCount <= 3) fileScore = 0.1;
  else if (fileCount <= 8) fileScore = 0.4;
  else fileScore = 0.8;

  const riskBonus = riskFileCount > 0 ? 0.5 : 0;
  return Math.min(1.0, fileScore + riskBonus);
}

/**
 * Score SD tier dimension (0-1)
 */
function scoreSdTier(tier) {
  if (tier <= 1) return 0.1;
  if (tier === 2) return 0.5;
  return 1.0; // tier 3+
}

/**
 * Score change type dimension (0-1)
 */
function scoreChangeType(changeType) {
  const scores = {
    config: 0.1,
    refactor: 0.2,
    docs: 0.1,
    test: 0.15,
    fix: 0.4,
    mixed: 0.5,
    feature: 0.6,
    new_code: 0.7,
    migration: 1.0,
    auth: 1.0
  };
  return scores[changeType] || 0.5;
}

/**
 * Check if any files match risk keywords (forces Deep tier)
 */
function hasRiskKeywords(files, sdDescription = '') {
  const filesMatch = files.some(f => RISK_FILE_PATTERNS.some(p => p.test(f)));
  const descMatch = RISK_KEYWORDS.some(k => sdDescription.toLowerCase().includes(k));
  return filesMatch || descMatch;
}

/**
 * Determine change type from file extensions and paths
 */
function inferChangeType(files) {
  const exts = files.map(f => f.split('.').pop()?.toLowerCase());
  const paths = files.map(f => f.toLowerCase());

  if (paths.some(p => /migrat/.test(p))) return 'migration';
  if (paths.some(p => RISK_FILE_PATTERNS.some(pat => pat.test(p)))) return 'auth';
  if (exts.every(e => ['md', 'txt', 'mdx'].includes(e))) return 'docs';
  if (exts.every(e => ['json', 'yaml', 'yml', 'toml', 'env'].includes(e))) return 'config';
  if (files.every(f => /test|spec|__test__/.test(f))) return 'test';
  if (files.length <= 3 && exts.every(e => ['js', 'ts', 'mjs', 'cjs'].includes(e))) return 'fix';
  return 'mixed';
}

/**
 * Compute composite risk score and tier classification
 *
 * @param {Object} diffStats - { linesChanged, filesChanged: string[] }
 * @param {number} sdTier - SD complexity tier (1, 2, or 3)
 * @param {string} [changeType] - Override change type; auto-inferred if omitted
 * @param {string} [sdDescription] - SD description for keyword scanning
 * @returns {{ tier: 'light'|'standard'|'deep', score: number, signals: Object, riskKeywordOverride: boolean }}
 */
export function computeRiskScore(diffStats, sdTier = 1, changeType, sdDescription = '') {
  const { linesChanged = 0, filesChanged = [] } = diffStats;
  const resolvedChangeType = changeType || inferChangeType(filesChanged);

  const signals = {
    loc: { raw: linesChanged, score: scoreLoc(linesChanged), weight: WEIGHTS.loc },
    riskSurface: { raw: filesChanged.length, score: scoreRiskSurface(filesChanged), weight: WEIGHTS.riskSurface },
    sdTier: { raw: sdTier, score: scoreSdTier(sdTier), weight: WEIGHTS.sdTier },
    changeType: { raw: resolvedChangeType, score: scoreChangeType(resolvedChangeType), weight: WEIGHTS.changeType }
  };

  const compositeScore =
    signals.loc.score * signals.loc.weight +
    signals.riskSurface.score * signals.riskSurface.weight +
    signals.sdTier.score * signals.sdTier.weight +
    signals.changeType.score * signals.changeType.weight;

  const riskKeywordOverride = hasRiskKeywords(filesChanged, sdDescription);

  let tier;
  if (riskKeywordOverride) {
    tier = 'deep';
  } else if (compositeScore <= 0.25) {
    tier = 'light';
  } else if (compositeScore <= 0.55) {
    tier = 'standard';
  } else {
    tier = 'deep';
  }

  return { tier, score: Math.round(compositeScore * 100) / 100, signals, riskKeywordOverride };
}

export { RISK_KEYWORDS, RISK_FILE_PATTERNS, WEIGHTS, TIER_THRESHOLDS, inferChangeType };
