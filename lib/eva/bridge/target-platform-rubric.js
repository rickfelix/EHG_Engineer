/**
 * Target Platform Decision Rubric — Programmatic Enforcement
 * SD-MOBILEFIRST-VENTURE-BUILD-STRATEGY-ORCH-001-D
 *
 * Auto-recommends target_platform based on venture characteristics.
 * Called before Stage 15 to ensure platform is set correctly.
 *
 * @module lib/eva/bridge/target-platform-rubric
 */

// Signal keywords that indicate platform preference
const MOBILE_SIGNALS = [
  'location', 'gps', 'map', 'nearby', 'navigation',
  'camera', 'photo', 'scan', 'qr', 'barcode',
  'push notification', 'alert', 'reminder',
  'on-the-go', 'mobile', 'phone', 'app',
  'fitness', 'health', 'tracking', 'wearable',
  'offline', 'sync', 'local-first',
  'b2c', 'consumer', 'marketplace', 'social',
];

const WEB_SIGNALS = [
  'dashboard', 'admin', 'analytics', 'reporting',
  'spreadsheet', 'table', 'data entry', 'form-heavy',
  'multi-monitor', 'workspace', 'editor',
  'seo', 'search engine', 'organic traffic', 'content marketing',
  'b2b', 'enterprise', 'saas', 'crm', 'erp',
  'portal', 'backoffice', 'management',
];

/**
 * Analyze venture metadata to recommend target_platform.
 *
 * @param {object} venture - Venture record with description, metadata, etc.
 * @param {string} venture.description - Venture description
 * @param {string} [venture.name] - Venture name
 * @param {object} [venture.metadata] - Additional venture metadata
 * @returns {{ recommendation: 'mobile'|'web'|'both', confidence: number, signals: object }}
 */
export function recommendPlatform(venture) {
  const text = [
    venture.description || '',
    venture.name || '',
    venture.metadata?.problem_statement || '',
    venture.metadata?.target_audience || '',
    venture.metadata?.value_proposition || '',
  ].join(' ').toLowerCase();

  let mobileScore = 0;
  let webScore = 0;
  const matchedMobile = [];
  const matchedWeb = [];

  for (const signal of MOBILE_SIGNALS) {
    if (text.includes(signal)) {
      mobileScore++;
      matchedMobile.push(signal);
    }
  }

  for (const signal of WEB_SIGNALS) {
    if (text.includes(signal)) {
      webScore++;
      matchedWeb.push(signal);
    }
  }

  let recommendation;
  let confidence;

  if (mobileScore > 0 && webScore > 0) {
    recommendation = 'both';
    confidence = 0.7;
  } else if (mobileScore > webScore) {
    recommendation = 'mobile';
    confidence = Math.min(0.95, 0.5 + mobileScore * 0.1);
  } else if (webScore > mobileScore) {
    recommendation = 'web';
    confidence = Math.min(0.95, 0.5 + webScore * 0.1);
  } else {
    // No signals — default to both (mobile-first with web support)
    recommendation = 'both';
    confidence = 0.5;
  }

  return {
    recommendation,
    confidence,
    signals: {
      mobile: { score: mobileScore, matched: matchedMobile },
      web: { score: webScore, matched: matchedWeb },
    },
  };
}

/**
 * Validate that a venture has target_platform set.
 * Called as a pre-Stage-15 gate.
 *
 * @param {object} venture - Venture record
 * @returns {{ valid: boolean, message: string, autoSet?: string }}
 */
export function validatePlatformSet(venture) {
  if (venture.target_platform && ['mobile', 'web', 'both'].includes(venture.target_platform)) {
    return { valid: true, message: `target_platform is set to '${venture.target_platform}'` };
  }

  const { recommendation, confidence, signals } = recommendPlatform(venture);
  return {
    valid: false,
    message: `target_platform not set. Auto-recommendation: '${recommendation}' (confidence: ${Math.round(confidence * 100)}%). Mobile signals: ${signals.mobile.matched.join(', ') || 'none'}. Web signals: ${signals.web.matched.join(', ') || 'none'}.`,
    autoSet: recommendation,
  };
}
