/**
 * Stage 18 Analysis Step — Marketing Copy Studio
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-B
 *
 * Reads 12 upstream venture artifacts and generates persona-targeted
 * marketing copy across 9 sections via LLM.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const COPY_SECTIONS = [
  'tagline', 'app_store_desc', 'landing_hero',
  'email_welcome', 'email_onboarding', 'email_reengagement',
  'social_posts', 'seo_meta', 'blog_draft',
];

const UPSTREAM_ARTIFACT_TYPES = [
  'truth_idea_brief',            // S1  — problem statement, value prop
  'truth_competitive_analysis',  // S4  — competitor names, differentiation
  'engine_pricing_model',        // S7  — pricing tiers
  'engine_business_model_canvas',// S8  — value proposition, customer segments
  'identity_persona_brand',      // S10 — customer personas with pain points
  'identity_brand_guidelines',   // S10 — brand voice, messaging pillars
  'identity_naming_visual',      // S11 — brand name, color palette, tagline
  'identity_brand_name',         // S11 — selected name + rationale
  'identity_gtm_sales_strategy', // S12 — channels, positioning, launch strategy
  'blueprint_product_roadmap',   // S13 — top features
  'blueprint_user_story_pack',   // S15 — user stories in user language
  'blueprint_financial_projection', // S16 — revenue projections
];

// 2026-04-21: LLM strategy — use getLLMClient() cascade (Anthropic > Google > Ollama)
// for marketing copy generation. Long-form content benefits from higher-quality models.
const SYSTEM_PROMPT = `You are EVA's Marketing Copy Studio. Generate persona-targeted marketing copy for a venture using upstream artifacts.

You MUST output valid JSON with exactly this structure:
{
  "tagline": {
    "text": "A compelling tagline (max 10 words)",
    "persona_target": "Primary persona name this targets"
  },
  "app_store_desc": {
    "text": "App store description (300-500 words). Include: what the product does, who it's for, key features, pricing mention, CTA.",
    "persona_target": "Primary persona name"
  },
  "landing_hero": {
    "headline": "Landing page headline (max 12 words)",
    "subheadline": "Supporting subheadline (max 25 words)",
    "cta_text": "Call-to-action button text (max 5 words)",
    "persona_target": "Primary persona name"
  },
  "email_welcome": {
    "subject": "Email subject line",
    "body": "Welcome email body (150-300 words). Warm, personal tone. Reference the problem they signed up to solve.",
    "persona_target": "Primary persona name"
  },
  "email_onboarding": {
    "subject": "Email subject line",
    "body": "Day-3 onboarding email (150-300 words). Show key features, quick wins.",
    "persona_target": "Primary persona name"
  },
  "email_reengagement": {
    "subject": "Email subject line",
    "body": "Re-engagement email (100-200 words). Remind of value, offer incentive.",
    "persona_target": "Primary persona name"
  },
  "social_posts": {
    "twitter": "Tweet-length post (max 280 chars)",
    "linkedin": "Professional post (100-200 words)",
    "instagram": "Visual-first caption with hashtags (100-150 words)",
    "facebook": "Conversational post (100-200 words)",
    "product_hunt": "Launch tagline for Product Hunt (max 60 chars)",
    "persona_target": "Primary persona name"
  },
  "seo_meta": {
    "title": "SEO meta title (max 60 chars)",
    "description": "SEO meta description (max 160 chars)",
    "keywords": ["keyword1", "keyword2", "...up to 10 keywords"],
    "persona_target": "Primary persona name"
  },
  "blog_draft": {
    "title": "Blog post title",
    "intro": "Opening paragraph (100-150 words) that hooks the reader with the problem",
    "sections": ["Section 1 heading", "Section 2 heading", "Section 3 heading"],
    "conclusion": "Closing paragraph with CTA (50-100 words)",
    "persona_target": "Primary persona name"
  }
}

Rules:
- ALWAYS use the primary persona's NAME in the copy where it makes sense naturally
- Address the persona's specific PAIN POINTS — do not use generic benefits
- Match the BRAND VOICE from brand guidelines (formal vs casual, technical vs simple)
- Include PRICING mention in app store description if pricing data available
- Use COMPETITOR DIFFERENTIATION from competitive analysis to position uniquely
- Social posts should be PLATFORM-SPECIFIC in tone and format
- SEO keywords should reflect the venture's domain and target audience search terms
- All copy must feel authentic and human, not AI-generated boilerplate`;

function buildUserPrompt(upstreamData, ventureName) {
  const sections = [];

  sections.push(`## Venture: ${ventureName || 'Unknown Venture'}\n`);

  if (upstreamData.truth_idea_brief) {
    sections.push(`## Idea Brief (S1)\n${JSON.stringify(upstreamData.truth_idea_brief, null, 2)}\n`);
  }
  if (upstreamData.truth_competitive_analysis) {
    sections.push(`## Competitive Analysis (S4)\n${JSON.stringify(upstreamData.truth_competitive_analysis, null, 2)}\n`);
  }
  if (upstreamData.engine_pricing_model) {
    sections.push(`## Pricing Model (S7)\n${JSON.stringify(upstreamData.engine_pricing_model, null, 2)}\n`);
  }
  if (upstreamData.engine_business_model_canvas) {
    sections.push(`## Business Model Canvas (S8)\n${JSON.stringify(upstreamData.engine_business_model_canvas, null, 2)}\n`);
  }
  if (upstreamData.identity_persona_brand) {
    sections.push(`## Personas & Brand (S10) — USE THIS PERSONA NAME IN COPY\n${JSON.stringify(upstreamData.identity_persona_brand, null, 2)}\n`);
  }
  if (upstreamData.identity_brand_guidelines) {
    sections.push(`## Brand Guidelines (S10) — MATCH THIS VOICE\n${JSON.stringify(upstreamData.identity_brand_guidelines, null, 2)}\n`);
  }
  if (upstreamData.identity_naming_visual) {
    sections.push(`## Naming & Visual Identity (S11)\n${JSON.stringify(upstreamData.identity_naming_visual, null, 2)}\n`);
  }
  if (upstreamData.identity_brand_name) {
    sections.push(`## Brand Name (S11)\n${JSON.stringify(upstreamData.identity_brand_name, null, 2)}\n`);
  }
  if (upstreamData.identity_gtm_sales_strategy) {
    sections.push(`## GTM Strategy (S12)\n${JSON.stringify(upstreamData.identity_gtm_sales_strategy, null, 2)}\n`);
  }
  if (upstreamData.blueprint_product_roadmap) {
    sections.push(`## Product Roadmap (S13)\n${JSON.stringify(upstreamData.blueprint_product_roadmap, null, 2)}\n`);
  }
  if (upstreamData.blueprint_user_story_pack) {
    sections.push(`## User Stories (S15)\n${JSON.stringify(upstreamData.blueprint_user_story_pack, null, 2)}\n`);
  }
  if (upstreamData.blueprint_financial_projection) {
    sections.push(`## Financial Projections (S16)\n${JSON.stringify(upstreamData.blueprint_financial_projection, null, 2)}\n`);
  }

  const availableCount = sections.length - 1; // minus the venture header
  sections.push(`\n## Available Upstream Data: ${availableCount}/12 artifacts`);
  if (availableCount < 6) {
    sections.push('⚠️ Limited upstream data. Generate copy from what is available. Flag gaps.');
  }

  sections.push('\nGenerate the complete marketing copy JSON now.');
  return sections.join('\n');
}

function extractUpstreamByType(stageDataMap) {
  const result = {};
  for (const [key, value] of Object.entries(stageDataMap || {})) {
    if (value?.__byType) {
      for (const [type, artifact] of Object.entries(value.__byType)) {
        if (UPSTREAM_ARTIFACT_TYPES.includes(type)) {
          result[type] = artifact?.artifact_data || artifact?.content || artifact;
        }
      }
    }
    // Also check direct artifact_type matches
    if (value?.artifact_type && UPSTREAM_ARTIFACT_TYPES.includes(value.artifact_type)) {
      result[value.artifact_type] = value?.artifact_data || value?.content || value;
    }
  }
  return result;
}

/**
 * Generate marketing copy from upstream artifacts via LLM.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data  - Truth: idea brief
 * @param {Object} params.stage4Data  - Truth: competitive analysis
 * @param {Object} params.stage7Data  - Engine: pricing model
 * @param {Object} params.stage8Data  - Engine: business model canvas
 * @param {Object} params.stage10Data - Identity: persona + brand guidelines
 * @param {Object} params.stage11Data - Identity: naming + visual
 * @param {Object} params.stage12Data - Identity: GTM strategy
 * @param {Object} params.stage13Data - Blueprint: product roadmap
 * @param {Object} params.stage15Data - Blueprint: user story pack
 * @param {Object} params.stage16Data - Blueprint: financial projection
 * @param {string} params.ventureName
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Marketing copy output
 */
export async function analyzeStage18MarketingCopy(params) {
  const {
    stage1Data, stage4Data, stage7Data, stage8Data,
    stage10Data, stage11Data, stage12Data, stage13Data,
    stage15Data, stage16Data,
    ventureName,
    logger = console,
  } = params;

  logger.info?.('[S18-MarketingCopy] Starting copy generation for', ventureName || 'unknown venture');

  // Merge upstream data, extracting by artifact type
  const allStageData = { stage1Data, stage4Data, stage7Data, stage8Data, stage10Data, stage11Data, stage12Data, stage13Data, stage15Data, stage16Data };
  const upstreamByType = extractUpstreamByType(allStageData);

  // Also check direct data shapes (some stages pass data directly, not via __byType)
  for (const [key, value] of Object.entries(allStageData)) {
    if (value && typeof value === 'object' && !value.__byType) {
      // Heuristic: map stageNData to known artifact types
      const stageNum = parseInt(key.replace('stage', '').replace('Data', ''), 10);
      const typeMap = { 1: 'truth_idea_brief', 4: 'truth_competitive_analysis', 7: 'engine_pricing_model', 8: 'engine_business_model_canvas', 10: 'identity_persona_brand', 11: 'identity_naming_visual', 12: 'identity_gtm_sales_strategy', 13: 'blueprint_product_roadmap', 15: 'blueprint_user_story_pack', 16: 'blueprint_financial_projection' };
      if (typeMap[stageNum] && !upstreamByType[typeMap[stageNum]]) {
        upstreamByType[typeMap[stageNum]] = value;
      }
    }
  }

  const availableTypes = Object.keys(upstreamByType);
  logger.info?.(`[S18-MarketingCopy] Available upstream artifacts: ${availableTypes.length}/12`, availableTypes);

  // Build LLM prompt
  const userPrompt = buildUserPrompt(upstreamByType, ventureName);

  let copyOutput;
  let usage = {};
  let llmFallbackCount = 0;

  try {
    const client = getLLMClient();
    const response = await client.complete(SYSTEM_PROMPT, userPrompt);
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};

    if (parsed && parsed.tagline) {
      copyOutput = parsed;
    } else {
      logger.warn('[S18-MarketingCopy] LLM returned invalid structure, using fallback');
      llmFallbackCount = 1;
      copyOutput = buildFallbackCopy(ventureName, upstreamByType);
    }
  } catch (err) {
    logger.error('[S18-MarketingCopy] LLM error:', err.message);
    llmFallbackCount = 1;
    copyOutput = buildFallbackCopy(ventureName, upstreamByType);
  }

  // Validate persona coverage
  const personaName = extractPersonaName(upstreamByType);
  const personaCoverage = personaName ? checkPersonaCoverage(copyOutput, personaName) : { covered: 0, total: COPY_SECTIONS.length, pct: 0 };

  // Build final output
  const result = {
    ...copyOutput,
    metadata: {
      upstream_artifacts_available: availableTypes.length,
      upstream_artifacts_used: availableTypes,
      missing_artifacts: UPSTREAM_ARTIFACT_TYPES.filter(t => !availableTypes.includes(t)),
      persona_name: personaName,
      persona_coverage: personaCoverage,
      venture_name: ventureName,
    },
    totalSections: COPY_SECTIONS.length,
    completedSections: COPY_SECTIONS.filter(s => copyOutput[s]).length,
    personaCoveragePct: personaCoverage.pct,
    llmFallbackCount,
    usage,
  };

  logger.info?.(`[S18-MarketingCopy] Complete: ${result.completedSections}/${result.totalSections} sections, persona coverage ${result.personaCoveragePct}%`);
  return result;
}

function extractPersonaName(upstreamByType) {
  const persona = upstreamByType.identity_persona_brand;
  if (!persona) return null;
  // Try common persona data shapes
  if (typeof persona === 'string') return persona;
  if (persona.primary_persona?.name) return persona.primary_persona.name;
  if (persona.personas?.[0]?.name) return persona.personas[0].name;
  if (persona.name) return persona.name;
  if (persona.persona_name) return persona.persona_name;
  return null;
}

function checkPersonaCoverage(copyOutput, personaName) {
  if (!personaName) return { covered: 0, total: COPY_SECTIONS.length, pct: 0 };
  const nameLower = personaName.toLowerCase();
  let covered = 0;
  for (const section of COPY_SECTIONS) {
    const sectionData = copyOutput[section];
    if (!sectionData) continue;
    const text = JSON.stringify(sectionData).toLowerCase();
    if (text.includes(nameLower)) covered++;
  }
  return { covered, total: COPY_SECTIONS.length, pct: Math.round((covered / COPY_SECTIONS.length) * 100) };
}

function buildFallbackCopy(ventureName, upstreamByType) {
  const name = ventureName || 'Our Product';
  const personaName = extractPersonaName(upstreamByType) || 'our target user';
  return {
    tagline: { text: `${name} — Built for ${personaName}`, persona_target: personaName },
    app_store_desc: { text: `${name} helps ${personaName} solve their challenges. [Fallback — LLM unavailable. Regenerate for full copy.]`, persona_target: personaName },
    landing_hero: { headline: `${name}: Your Solution`, subheadline: `Built specifically for ${personaName}`, cta_text: 'Get Started', persona_target: personaName },
    email_welcome: { subject: `Welcome to ${name}!`, body: `Hi ${personaName}, welcome aboard. [Fallback copy — regenerate for full version.]`, persona_target: personaName },
    email_onboarding: { subject: `Getting started with ${name}`, body: `Here are your first steps. [Fallback copy — regenerate for full version.]`, persona_target: personaName },
    email_reengagement: { subject: `We miss you at ${name}`, body: `Come back and see what's new. [Fallback copy — regenerate for full version.]`, persona_target: personaName },
    social_posts: { twitter: `Introducing ${name} for ${personaName}`, linkedin: `${name} launch. [Fallback]`, instagram: `${name} is here! [Fallback]`, facebook: `${name} for ${personaName}. [Fallback]`, product_hunt: `${name} — for ${personaName}`, persona_target: personaName },
    seo_meta: { title: name, description: `${name} helps ${personaName}`, keywords: [name.toLowerCase()], persona_target: personaName },
    blog_draft: { title: `Introducing ${name}`, intro: `[Fallback — regenerate for full blog draft.]`, sections: ['The Problem', 'Our Solution', 'Getting Started'], conclusion: `Try ${name} today.`, persona_target: personaName },
  };
}

export { COPY_SECTIONS, UPSTREAM_ARTIFACT_TYPES };
