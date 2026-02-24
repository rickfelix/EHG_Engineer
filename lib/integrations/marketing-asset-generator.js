/**
 * Marketing Asset Generator
 * SD: SD-LEO-FDBK-FEAT-VIDEO-EMPHASIZES-CEO-002
 *
 * Generates HTML landing pages and ad copy variants for Promoter Blueprint
 * campaigns using LLM completion with fallback templates.
 */

import { getFastClient } from '../llm/client-factory.js';

/**
 * Fallback landing page template when LLM is unavailable
 * @param {Object} params
 * @returns {string} HTML string
 */
function fallbackLandingPage(params) {
  const title = params.title || 'Your Next Step';
  const description = params.description || 'Discover how we can help you achieve your goals.';
  const ctaText = params.ctaText || 'Get Started';
  const ctaUrl = params.ctaUrl || '#';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e;background:#f8f9fa}
.hero{max-width:640px;margin:60px auto;padding:40px 24px;text-align:center}
h1{font-size:2rem;margin-bottom:16px;line-height:1.3}
p{font-size:1.125rem;color:#4a4a6a;margin-bottom:32px;line-height:1.6}
.cta{display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:600}
.cta:hover{background:#1d4ed8}
@media(max-width:480px){.hero{padding:32px 16px}h1{font-size:1.5rem}}
</style>
</head>
<body>
<div class="hero">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(description)}</p>
<a href="${escapeHtml(ctaUrl)}" class="cta">${escapeHtml(ctaText)}</a>
</div>
</body>
</html>`;
}

/**
 * Fallback ad copy when LLM is unavailable
 * @param {Object} params
 * @returns {Array<{headline: string, body: string}>}
 */
function fallbackAdCopy(params) {
  const product = params.product || params.title || 'our solution';
  const benefit = params.benefit || 'transform your results';
  return [
    { headline: `Discover ${product}`, body: `Ready to ${benefit}? Start today and see the difference.` },
    { headline: `Why ${product} works`, body: `Join others who have already achieved results with ${product}.` },
    { headline: `${product} — limited time`, body: `Act now to ${benefit}. Don't miss this opportunity.` }
  ];
}

/**
 * Escape HTML entities to prevent XSS in generated output
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate an HTML landing page for a campaign.
 * @param {Object} params - Campaign parameters
 * @param {string} params.title - Campaign/product title
 * @param {string} [params.description] - Campaign description
 * @param {string} [params.ctaText] - Call-to-action button text
 * @param {string} [params.ctaUrl] - CTA destination URL
 * @param {string} [params.stage] - Promoter Blueprint stage (traffic|holding_pattern|selling_event|outcomes)
 * @param {string} [params.tone] - Desired tone (professional|casual|urgent)
 * @returns {Promise<string>} Self-contained HTML string
 */
export async function generateLandingPage(params = {}) {
  try {
    const client = await getFastClient();
    const stage = params.stage || 'selling_event';
    const tone = params.tone || 'professional';

    const systemPrompt = 'You are a marketing landing page generator. Return ONLY valid HTML. No markdown, no explanation, no code fences.';
    const userPrompt = `Create a self-contained HTML landing page with these requirements:
- Title: ${params.title || 'Campaign Page'}
- Description: ${params.description || 'A compelling campaign page'}
- CTA button text: ${params.ctaText || 'Get Started'}
- CTA URL: ${params.ctaUrl || '#'}
- Promoter Blueprint stage: ${stage}
- Tone: ${tone}

Requirements:
- Valid HTML5 with DOCTYPE
- All CSS inline in a <style> tag (no external stylesheets)
- Mobile-responsive (use media queries)
- Clean, modern design
- Prominent CTA button
- lang="en" on html tag`;

    const html = await client.complete(systemPrompt, userPrompt, { maxTokens: 2000 });

    // Basic validation: must contain <!DOCTYPE or <html
    if (html && (html.includes('<!DOCTYPE') || html.includes('<html'))) {
      return html.trim();
    }

    // LLM returned non-HTML, use fallback
    return fallbackLandingPage(params);
  } catch (err) {
    // LLM unavailable, use fallback template
    return fallbackLandingPage(params);
  }
}

/**
 * Generate ad copy variants for a campaign.
 * @param {Object} params - Product/offer details
 * @param {string} params.product - Product or service name
 * @param {string} [params.benefit] - Key benefit/value proposition
 * @param {string} [params.audience] - Target audience description
 * @param {string} [params.stage] - Promoter Blueprint stage
 * @param {number} [params.variants] - Number of variants (default: 3, min: 3)
 * @returns {Promise<Array<{headline: string, body: string}>>} Ad copy variants
 */
export async function generateAdCopy(params = {}) {
  const variantCount = Math.max(3, params.variants || 3);

  try {
    const client = await getFastClient();

    const systemPrompt = 'You are an ad copywriter. Return ONLY a valid JSON array. No markdown, no explanation, no code fences.';
    const userPrompt = `Generate ${variantCount} ad copy variants as a JSON array.

Product: ${params.product || params.title || 'Our Product'}
Key benefit: ${params.benefit || 'achieve better results'}
Target audience: ${params.audience || 'business professionals'}
Promoter Blueprint stage: ${params.stage || 'traffic'}

Return format (JSON array only):
[{"headline": "...", "body": "..."}, ...]

Each variant should have a different angle or hook. Headlines should be under 60 characters. Body text should be 1-2 sentences.`;

    const response = await client.complete(systemPrompt, userPrompt, { maxTokens: 1000 });

    // Parse JSON response
    const cleaned = response.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const variants = JSON.parse(cleaned);

    if (Array.isArray(variants) && variants.length >= 3 &&
        variants.every(v => v.headline && v.body)) {
      return variants;
    }

    return fallbackAdCopy(params);
  } catch (err) {
    // LLM unavailable or parse failure, use fallback
    return fallbackAdCopy(params);
  }
}

export default { generateLandingPage, generateAdCopy };
