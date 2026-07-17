/**
 * Reddit source fetcher for the Market Signal Scanner (FR-1).
 * SD: SD-LEO-INFRA-MARKET-SIGNAL-SCANNER-001
 *
 * Mines target subreddits for complaint-mention-velocity (e.g. "switching from",
 * "alternative to", "hate that", "wish it had") for a given query term and
 * derives ONE 'structural' family reading -- per the v1 source/family
 * assignment in the design doc: wordpress_plugins -> money_in + stickiness,
 * reddit -> structural, google_trends -> attention.
 *
 * Reddit requires a one-time free OAuth app registration ("script" app type
 * at reddit.com/prefs/apps) -- REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET, see
 * .env.example. This module ships INERT until those env vars are set: with
 * either missing it fails soft (returns an errors-array entry) and NEVER
 * throws, matching this codebase's "merge inert behind unset env" convention.
 */

import crypto from 'node:crypto';
import { computeSlopeAndPersist } from '../slope.js';

const SOURCE_NAME = 'reddit';
const TRANSFORM_VERSION = 'v1';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const USER_AGENT =
  'ehg-market-signal-scanner/1.0 (by /u/ehg-scanner; https://github.com/rickfelix/EHG_Engineer)';

// Config-driven default target subreddits -- v1 keeps this small and
// overridable via query.subreddits. Broader/niche-specific subreddit
// targeting is a later increment (design doc M1-M5, thin-slice scope).
const DEFAULT_SUBREDDITS = ['software', 'SaaS', 'sysadmin', 'selfhosted', 'smallbusiness'];

// Complaint-language markers used to compute complaint-mention-velocity.
// Deliberately a simple keyword screen for v1 (design doc STRUCTURAL family
// section) -- a smarter NLP classifier is an explicitly out-of-scope,
// documented future increment, not a silent omission.
const COMPLAINT_KEYWORDS = [
  'switching from',
  'alternative to',
  'hate that',
  'wish it had',
  "doesn't support",
  'no longer support',
  'looking for an alternative',
  'fed up with',
];

function sha256Hex(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(text).digest('hex');
}

function countComplaintMatches(children) {
  let matches = 0;
  for (const child of children) {
    const data = child?.data || {};
    const haystack = `${data.title || ''} ${data.selftext || ''}`.toLowerCase();
    if (COMPLAINT_KEYWORDS.some((kw) => haystack.includes(kw))) {
      matches += 1;
    }
  }
  return matches;
}

async function getAccessToken(clientId, clientSecret) {
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error(`Reddit OAuth token request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (!payload?.access_token) {
    throw new Error('Reddit OAuth token response missing access_token');
  }
  return payload.access_token;
}

async function fetchSubredditSearch({ accessToken, subreddits, term }) {
  const subredditPath = subreddits.join('+');
  const url = `https://oauth.reddit.com/r/${subredditPath}/search?q=${encodeURIComponent(term)}&restrict_sr=1&sort=new&limit=100&t=month`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Reddit search request failed with status ${response.status}`);
  }

  const data = await response.json();
  return { url, data };
}

/** complaintDensity (0..1 ratio) is the numeric signal inside reddit's object raw_value. */
function extractComplaintDensity(rawValue) {
  return rawValue && typeof rawValue.complaintDensity === 'number' && Number.isFinite(rawValue.complaintDensity)
    ? rawValue.complaintDensity
    : null;
}

/**
 * @param {{ query: { term: string, subreddits?: string[] }, supabase?: import('@supabase/supabase-js').SupabaseClient }} args
 * @returns {Promise<{ readings: Array<{family: string, slope_90d_vs_baseline: number|null, observations: object[]}>, errors: string[] }>}
 */
export async function fetchSignal({ query, supabase } = {}) {
  const errors = [];
  const term = query?.term;

  if (!term) {
    return { readings: [], errors: ['reddit fetcher: query.term is required'] };
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      readings: [],
      errors: [
        'Reddit credentials not configured -- set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET ' +
          '(one-time free OAuth app registration at reddit.com/prefs/apps; see .env.example)',
      ],
    };
  }

  const subreddits =
    Array.isArray(query.subreddits) && query.subreddits.length > 0
      ? query.subreddits
      : DEFAULT_SUBREDDITS;

  let accessToken;
  try {
    accessToken = await getAccessToken(clientId, clientSecret);
  } catch (err) {
    return { readings: [], errors: [`Reddit OAuth failed: ${err.message}`] };
  }

  let searchResult;
  try {
    searchResult = await fetchSubredditSearch({ accessToken, subreddits, term });
  } catch (err) {
    return { readings: [], errors: [`Reddit search fetch failed: ${err.message}`] };
  }

  const children = searchResult.data?.data?.children || [];
  const totalPosts = children.length;
  const complaintMatches = countComplaintMatches(children);
  const complaintDensity = totalPosts > 0 ? complaintMatches / totalPosts : 0;

  const rawValue = { totalPosts, complaintMatches, complaintDensity, subreddits, term };
  const fetchedAt = new Date().toISOString();
  const contentHash = sha256Hex(searchResult.data);

  const observation = {
    source: SOURCE_NAME,
    raw_value: rawValue,
    source_url: searchResult.url,
    content_hash: contentHash,
    fetched_at: fetchedAt,
    transform_version: TRANSFORM_VERSION,
  };

  const slope = await computeSlopeAndPersist({
    supabase,
    source: SOURCE_NAME,
    queryTerm: term,
    family: 'structural',
    rawValue,
    observation,
    errors,
    extractValue: extractComplaintDensity,
  });

  return {
    readings: [
      {
        family: 'structural',
        slope_90d_vs_baseline: slope,
        observations: [observation],
      },
    ],
    errors,
  };
}

export const __internal = { DEFAULT_SUBREDDITS, COMPLAINT_KEYWORDS, sha256Hex };
