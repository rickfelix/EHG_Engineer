/**
 * Parse free-form LLM revenue strings into a normalized {low, high, currency} object.
 *
 * The LLM emits monthly_revenue_potential as a freeform string in many shapes; this
 * helper normalizes them so rankCandidates can compute a numeric revenue contribution.
 * Yearly inputs are normalized to monthly (divided by 12).
 *
 * Returns null for unparseable input — never throws. Callers fall back to a neutral
 * revenue contribution when null.
 *
 * Supported input forms (>=8, per AC-6):
 *   '$5K/month'              → { low: 5000,  high: 5000,  currency: 'USD' }
 *   '$5,000-$50,000/mo'      → { low: 5000,  high: 50000, currency: 'USD' }
 *   '$1K+/month'             → { low: 1000,  high: 1000,  currency: 'USD' }
 *   '$500-$2000 monthly'     → { low: 500,   high: 2000,  currency: 'USD' }
 *   '~$10K MRR'              → { low: 10000, high: 10000, currency: 'USD' }
 *   '$2K+'                   → { low: 2000,  high: 2000,  currency: 'USD' }
 *   '$60K/year'              → { low: 5000,  high: 5000,  currency: 'USD' }   // /12
 *   '$10M/year'              → { low: 833333, high: 833333, currency: 'USD' } // /12
 *   'unknown' or ''          → null
 *
 * @param {string|null|undefined} input
 * @returns {{low: number, high: number, currency: 'USD'} | null}
 */
export function parseRevenuePotential(input) {
  if (input == null || typeof input !== 'string') return null;
  const s = input.trim();
  if (!s) return null;

  // Numeric extraction: capture any "$<number><suffix>" tokens. Suffix in {K,M,B} (case-insensitive).
  // Matches: $5K, $5,000, $5.5K, $5M, $5,000,000, $500
  const tokenRe = /\$\s*([\d,]+(?:\.\d+)?)\s*([KMB])?/gi;
  const tokens = [];
  let m;
  while ((m = tokenRe.exec(s)) !== null) {
    const num = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    const suffix = (m[2] || '').toUpperCase();
    const mult = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
    tokens.push(Math.round(num * mult));
  }

  if (tokens.length === 0) return null;

  // Detect yearly vs monthly. Default is monthly when ambiguous (matches current LLM prompt asks).
  const lower = s.toLowerCase();
  const isYearly = /\b(year|yearly|annual|annually|\/yr|\/year|per\s+year|p\.?a\.?)\b/.test(lower);

  // Range detection — two tokens with an explicit hyphen or 'to'/'-' between them.
  const isRange = tokens.length >= 2 && /(\d.*[\-–]\s*\$|\bto\b)/i.test(s);

  let low;
  let high;
  if (isRange) {
    low = Math.min(tokens[0], tokens[1]);
    high = Math.max(tokens[0], tokens[1]);
  } else {
    low = tokens[0];
    high = tokens[0];
  }

  if (isYearly) {
    low = Math.round(low / 12);
    high = Math.round(high / 12);
  }

  return { low, high, currency: 'USD' };
}
