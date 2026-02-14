/**
 * UTM Parameter Generation
 * SD-EVA-FEAT-MARKETING-FOUNDATION-001
 *
 * Generates UTM tracking parameters for marketing attribution.
 */

/**
 * Generate UTM parameters
 * @param {object} params
 * @param {string} params.source - Traffic source (platform name)
 * @param {string} params.medium - Marketing medium (social, email, paid)
 * @param {string} params.campaign - Campaign identifier
 * @param {string} [params.content] - Content identifier (variant key)
 * @param {string} [params.term] - Search term (for paid campaigns)
 * @returns {object} UTM parameter object
 */
export function generateUTMParams({ source, medium, campaign, content, term }) {
  const utm = {
    utm_source: sanitizeParam(source),
    utm_medium: sanitizeParam(medium),
    utm_campaign: sanitizeParam(campaign)
  };

  if (content) utm.utm_content = sanitizeParam(content);
  if (term) utm.utm_term = sanitizeParam(term);

  return utm;
}

/**
 * Build UTM query string
 * @param {object} utm - UTM parameters
 * @returns {string} Query string (without leading ?)
 */
export function buildUTMQueryString(utm) {
  return Object.entries(utm)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Append UTM parameters to a URL
 * @param {string} url - Base URL
 * @param {object} utm - UTM parameters
 * @returns {string} URL with UTM parameters
 */
export function appendUTMToUrl(url, utm) {
  const qs = buildUTMQueryString(utm);
  if (!qs) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${qs}`;
}

/**
 * Sanitize UTM parameter value
 * Replace spaces with hyphens, lowercase, remove special chars
 */
function sanitizeParam(value) {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_]/g, '')
    .substring(0, 100);
}
