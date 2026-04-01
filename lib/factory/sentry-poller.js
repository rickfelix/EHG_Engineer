/**
 * Sentry REST API Poller
 *
 * Polls Sentry for new issues per venture. Uses the Issues endpoint
 * with cursor-based pagination and last-seen filtering to fetch only
 * new errors since the previous poll.
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001
 */

const DEFAULT_POLL_LIMIT = 25;
const BACKOFF_BASE_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Poll Sentry REST API for new issues for a venture.
 *
 * @param {object} config
 * @param {string} config.sentryOrg - Sentry organization slug
 * @param {string} config.sentryProject - Sentry project slug
 * @param {string} config.sentryToken - Sentry auth token (bearer)
 * @param {string} [config.baseUrl] - Sentry API base URL (default: https://sentry.io, use https://de.sentry.io for EU)
 * @param {string} [config.since] - ISO timestamp — only fetch issues seen after this time
 * @param {number} [config.limit] - Max issues to fetch (default: 25)
 * @returns {Promise<object[]>} Array of normalized error objects
 */
export async function pollVentureErrors(config) {
  const { sentryOrg, sentryProject, sentryToken, baseUrl: sentryBaseUrl, since, limit = DEFAULT_POLL_LIMIT } = config;

  if (!sentryOrg || !sentryProject || !sentryToken) {
    throw new Error('Missing required Sentry config: sentryOrg, sentryProject, sentryToken');
  }

  const apiHost = sentryBaseUrl || 'https://sentry.io';
  const issuesUrl = `${apiHost}/api/0/projects/${sentryOrg}/${sentryProject}/issues/`;
  const params = new URLSearchParams({
    limit: String(limit),
    sort: 'date',
    query: 'is:unresolved'
  });
  if (since) params.set('start', since);

  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${issuesUrl}?${params}`, {
        headers: {
          'Authorization': `Bearer ${sentryToken}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
        console.warn(`[SentryPoller] Rate limited. Retry after ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Sentry API ${response.status}: ${await response.text()}`);
      }

      const issues = await response.json();
      return issues.map(normalizeIssue);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.warn(`[SentryPoller] Attempt ${attempt + 1} failed: ${err.message}. Retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Sentry poll failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

/**
 * Normalize a Sentry issue into the format expected by feedback-writer.
 */
function normalizeIssue(issue) {
  const severityMap = {
    fatal: 'critical',
    error: 'high',
    warning: 'medium',
    info: 'low',
    debug: 'low'
  };

  return {
    sentryIssueId: String(issue.id),
    title: issue.title || 'Unknown error',
    value: issue.metadata?.value || issue.culprit || '',
    stacktrace: issue.metadata?.filename ? `${issue.metadata.filename}:${issue.metadata.function || '?'}` : '',
    severity: severityMap[issue.level] || 'medium',
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    count: issue.count || 1,
    platform: issue.platform || 'node',
    shortId: issue.shortId
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { DEFAULT_POLL_LIMIT, MAX_RETRIES };
