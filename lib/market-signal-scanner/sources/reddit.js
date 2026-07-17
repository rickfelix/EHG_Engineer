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

const TRANSFORM_VERSION = 'v1';
const OBSERVATIONS_TABLE = 'market_signal_observations';
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

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

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

// Returns the most-recent-90d average minus the 12-month baseline average
// for this (source, query_term, family), or null when there isn't enough
// prior history yet (first-ever call) -- treated as "no reading" this cycle,
// never as a zero/negative reading.
async function computeSlope({ supabase, term, family }) {
  if (!supabase) return null;

  const since = new Date(Date.now() - TWELVE_MONTHS_MS).toISOString();
  const { data: priorRows, error } = await supabase
    .from(OBSERVATIONS_TABLE)
    .select('raw_value, fetched_at')
    .eq('source', 'reddit')
    .eq('query_term', term)
    .eq('family', family)
    .gte('fetched_at', since);

  if (error || !priorRows || priorRows.length === 0) {
    return null;
  }

  const numericOf = (row) => {
    const v = row.raw_value;
    if (typeof v === 'number') return v;
    if (v && typeof v.complaintDensity === 'number') return v.complaintDensity;
    return 0;
  };

  const ninetyDaysAgo = Date.now() - NINETY_DAYS_MS;
  const recent = priorRows.filter((r) => new Date(r.fetched_at).getTime() >= ninetyDaysAgo);
  if (recent.length === 0) return null;

  const avg = (rows) => rows.reduce((sum, r) => sum + numericOf(r), 0) / rows.length;
  return avg(recent) - avg(priorRows);
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
    source: 'reddit',
    raw_value: rawValue,
    source_url: searchResult.url,
    content_hash: contentHash,
    fetched_at: fetchedAt,
    transform_version: TRANSFORM_VERSION,
  };

  let slope = null;
  try {
    slope = await computeSlope({ supabase, term, family: 'structural' });
  } catch (err) {
    errors.push(`Reddit slope computation failed (non-fatal, returning null slope): ${err.message}`);
  }

  if (supabase) {
    try {
      const { error: insertError } = await supabase.from(OBSERVATIONS_TABLE).insert({
        source: 'reddit',
        query_term: term,
        family: 'structural',
        raw_value: rawValue,
        content_hash: contentHash,
        fetched_at: fetchedAt,
        transform_version: TRANSFORM_VERSION,
      });
      if (insertError) {
        errors.push(`Reddit observation insert failed (non-fatal): ${insertError.message}`);
      }
    } catch (err) {
      errors.push(`Reddit observation insert threw (non-fatal): ${err.message}`);
    }
  }

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
