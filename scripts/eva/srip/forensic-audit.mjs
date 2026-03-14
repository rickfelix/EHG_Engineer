/**
 * SRIP Forensic Audit Module
 * SD: SD-MAN-ORCH-SRIP-CLONER-INTEGRATION-001-B
 *
 * 6-step Site DNA extraction pipeline:
 *   1. Macro Architecture Analysis
 *   2. Design Token Identification
 *   3. Section Blueprint Mapping
 *   4. Component Behavior Cataloging
 *   5. Visual Composition Analysis
 *   6. Tech Stack Detection
 *
 * Input: URL + optional screenshot path
 * Output: Structured dna_json stored in srip_site_dna table
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getValidationClient } from '../../../lib/llm/client-factory.js';

dotenv.config();

const MAX_CONTENT_CHARS = 8000;

const EXTRACTION_STEPS = [
  { key: 'macro_architecture', label: 'Macro Architecture Analysis' },
  { key: 'design_tokens', label: 'Design Token Identification' },
  { key: 'section_blueprints', label: 'Section Blueprint Mapping' },
  { key: 'component_behaviors', label: 'Component Behavior Cataloging' },
  { key: 'visual_composition', label: 'Visual Composition Analysis' },
  { key: 'tech_stack', label: 'Tech Stack Detection' },
];

// ============================================================================
// URL Fetching
// ============================================================================

async function fetchPageContent(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return html.substring(0, MAX_CONTENT_CHARS);
  } catch (err) {
    throw new Error(`Failed to fetch ${url}: ${err.message}`);
  }
}

// ============================================================================
// LLM Extraction Prompts
// ============================================================================

function buildSystemPrompt(stepKey) {
  const prompts = {
    macro_architecture: `You are a web design forensics expert. Analyze the provided HTML and extract the page's macro architecture.

Return ONLY valid JSON:
{
  "sections": [
    { "name": "header", "layout_type": "flex|grid|block", "content_description": "Navigation bar with logo and menu" }
  ],
  "grid_system": "flexbox|css-grid|table|unknown",
  "responsive_approach": "mobile-first|desktop-first|unknown",
  "page_flow": "single-column|two-column|multi-column|hero-sections"
}`,

    design_tokens: `You are a design system analyst. Extract visual design tokens from the HTML/CSS.

Return ONLY valid JSON:
{
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#hex",
    "text": "#hex",
    "additional": ["#hex"]
  },
  "typography": {
    "font_family": "Font Name, fallback",
    "heading_font": "Font Name or same",
    "size_scale": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"],
    "weights": [400, 600, 700],
    "line_heights": [1.2, 1.5, 1.6]
  },
  "spacing": ["4px", "8px", "16px", "24px", "32px", "48px", "64px"],
  "border_radius": ["0", "4px", "8px", "9999px"],
  "shadows": ["none", "0 1px 3px rgba(0,0,0,0.1)"]
}`,

    section_blueprints: `You are a UI layout analyst. For each major page section, produce a structural blueprint.

Return ONLY valid JSON:
{
  "blueprints": [
    {
      "section_name": "hero",
      "layout": "center-aligned|left-aligned|split",
      "content_elements": ["heading", "subheading", "cta_button", "image"],
      "visual_weight": "high|medium|low",
      "spacing_pattern": "generous|compact|mixed"
    }
  ]
}`,

    component_behaviors: `You are a UI component analyst. Identify interactive components and their visual patterns.

Return ONLY valid JSON:
{
  "components": [
    {
      "type": "button|input|nav|card|modal|tooltip|accordion",
      "variants": ["primary", "secondary", "ghost"],
      "visual_states": ["default", "hover", "active", "disabled"],
      "styling_notes": "Rounded corners, gradient background"
    }
  ]
}`,

    visual_composition: `You are a visual design analyst. Analyze the overall visual hierarchy and composition.

Return ONLY valid JSON:
{
  "hierarchy": {
    "primary_focal_point": "Hero heading with CTA",
    "secondary_elements": ["Feature cards", "Social proof"],
    "contrast_strategy": "Dark header on light body"
  },
  "whitespace": "generous|moderate|compact",
  "alignment": "center|left|mixed",
  "visual_rhythm": "consistent|varied|progressive",
  "color_usage": "monochrome|complementary|triadic|analogous"
}`,

    tech_stack: `You are a web technology analyst. Detect the frontend technology stack from HTML source.

Return ONLY valid JSON:
{
  "framework": "React|Vue|Angular|Svelte|Next.js|Gatsby|static|unknown",
  "css_approach": "Tailwind|CSS Modules|Styled Components|Sass|vanilla|unknown",
  "build_tool": "Webpack|Vite|Parcel|unknown",
  "key_libraries": ["library1", "library2"],
  "rendering": "SSR|SSG|CSR|hybrid|unknown"
}`,
  };

  return prompts[stepKey] || 'Analyze the provided content and return structured JSON.';
}

// ============================================================================
// Single Step Extraction
// ============================================================================

async function runExtractionStep(stepKey, content, llmClient) {
  const systemPrompt = buildSystemPrompt(stepKey);
  const userPrompt = `Analyze this web page content and extract the requested information:\n\n${content}`;

  const maxRetries = 1;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await llmClient.complete(systemPrompt, userPrompt);
      const response = typeof result === 'string' ? result : result.content;
      let cleaned = response.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }
      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
      }
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    } catch (err) {
      if (attempt === maxRetries) {
        return { error: `Parse failed after ${maxRetries + 1} attempts: ${err.message}` };
      }
    }
  }
}

// ============================================================================
// Main Audit Pipeline
// ============================================================================

export async function runForensicAudit({ url, screenshot, ventureId }) {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('\n🔍 SRIP Forensic Audit');
  console.log(`   URL: ${url}`);
  if (screenshot) console.log(`   Screenshot: ${screenshot}`);
  if (ventureId) console.log(`   Venture: ${ventureId}`);

  // Step 0: Fetch content
  let content;
  if (screenshot) {
    const { readFileSync } = await import('fs');
    content = `[Screenshot analysis mode - image at: ${screenshot}]`;
    console.log('\n   📸 Screenshot mode (LLM will analyze description)');
  } else {
    console.log('\n   🌐 Fetching page content...');
    try {
      content = await fetchPageContent(url);
      console.log(`   ✅ Fetched ${content.length} chars`);
    } catch (err) {
      console.error(`   ❌ ${err.message}`);

      // Store failed record
      await supabase.from('srip_site_dna').insert({
        venture_id: ventureId || null,
        reference_url: url,
        screenshot_path: screenshot || null,
        dna_json: {},
        extraction_steps: [{ step: 'fetch', status: 'failed', error: err.message, timestamp: new Date().toISOString() }],
        status: 'failed',
        created_by: 'SRIP_FORENSIC_AUDIT'
      });
      return null;
    }
  }

  // Initialize LLM client
  const llmClient = getValidationClient();

  // Run 6 extraction steps
  const dnaJson = {};
  const extractionSteps = [];
  let successCount = 0;

  for (const step of EXTRACTION_STEPS) {
    console.log(`\n   📊 Step: ${step.label}...`);
    const startTime = Date.now();

    try {
      const result = await runExtractionStep(step.key, content, llmClient);
      const elapsed = Date.now() - startTime;

      if (result.error) {
        console.log(`   ⚠️  ${step.label}: ${result.error} (${elapsed}ms)`);
        dnaJson[step.key] = result;
        extractionSteps.push({ step: step.key, status: 'failed', error: result.error, elapsed_ms: elapsed, timestamp: new Date().toISOString() });
      } else {
        console.log(`   ✅ ${step.label} extracted (${elapsed}ms)`);
        dnaJson[step.key] = result;
        extractionSteps.push({ step: step.key, status: 'completed', elapsed_ms: elapsed, timestamp: new Date().toISOString() });
        successCount++;
      }
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.log(`   ❌ ${step.label}: ${err.message} (${elapsed}ms)`);
      dnaJson[step.key] = { error: err.message };
      extractionSteps.push({ step: step.key, status: 'failed', error: err.message, elapsed_ms: elapsed, timestamp: new Date().toISOString() });
    }
  }

  // Calculate quality score based on successful steps
  const qualityScore = Math.round((successCount / EXTRACTION_STEPS.length) * 100);
  const status = successCount === EXTRACTION_STEPS.length ? 'completed'
    : successCount > 0 ? 'completed'
    : 'failed';

  // Persist to database
  const { data, error } = await supabase.from('srip_site_dna').insert({
    venture_id: ventureId || null,
    reference_url: url,
    screenshot_path: screenshot || null,
    dna_json: dnaJson,
    extraction_steps: extractionSteps,
    quality_score: qualityScore,
    status: status,
    created_by: 'SRIP_FORENSIC_AUDIT'
  }).select('id, quality_score, status');

  if (error) {
    console.error(`\n   ❌ DB insert failed: ${error.message}`);
    return null;
  }

  console.log(`\n   ✅ Site DNA stored: ${data[0].id}`);
  console.log(`   📊 Quality: ${data[0].quality_score}/100 (${successCount}/${EXTRACTION_STEPS.length} steps)`);
  console.log(`   📌 Status: ${data[0].status}`);

  return data[0];
}
