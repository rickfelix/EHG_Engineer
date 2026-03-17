/**
 * SRIP Site DNA Extractor
 * SD: SD-LEO-INFRA-SRIP-CORE-PIPELINE-001
 *
 * Stage 1 of the SRIP pipeline: Site DNA Extraction
 * Extracts brand elements (colors, fonts, imagery, copy, layout) from live URLs
 * using a headless browser, with manual fallback for blocked sites.
 *
 * Input: URL or manual screenshot/text
 * Output: Structured DNA stored in srip_site_dna table
 */

import { createSupabaseServiceClient } from '../../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// DNA Extraction Steps
// ============================================================================

/**
 * Extract design tokens (colors, fonts, spacing) from page CSS.
 */
async function extractDesignTokens(page) {
  return page.evaluate(() => {
    const body = document.body;
    const computed = getComputedStyle(body);

    // Collect unique colors from all elements
    const colorSet = new Set();
    const fontSet = new Set();
    const allElements = document.querySelectorAll('*');

    const sampled = Array.from(allElements).slice(0, 200);
    for (const el of sampled) {
      const style = getComputedStyle(el);
      if (style.color) colorSet.add(style.color);
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        colorSet.add(style.backgroundColor);
      }
      if (style.fontFamily) fontSet.add(style.fontFamily);
    }

    // Find primary/secondary colors by frequency
    const colorCounts = {};
    for (const el of sampled) {
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') {
        colorCounts[bg] = (colorCounts[bg] || 0) + 1;
      }
    }
    const sortedColors = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);

    // Convert rgb to hex
    function rgbToHex(rgb) {
      const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (!match) return rgb;
      return '#' + [match[1], match[2], match[3]]
        .map(n => parseInt(n).toString(16).padStart(2, '0'))
        .join('');
    }

    return {
      colors: {
        primary: sortedColors[0] ? rgbToHex(sortedColors[0][0]) : null,
        secondary: sortedColors[1] ? rgbToHex(sortedColors[1][0]) : null,
        accent: sortedColors[2] ? rgbToHex(sortedColors[2][0]) : null,
        background: rgbToHex(computed.backgroundColor) || '#ffffff',
        text: rgbToHex(computed.color) || '#333333',
        additional: sortedColors.slice(3, 8).map(c => rgbToHex(c[0])),
      },
      typography: {
        font_family: computed.fontFamily?.split(',')[0]?.trim().replace(/['"]/g, '') || 'sans-serif',
        heading_font: (() => {
          const h1 = document.querySelector('h1,h2');
          return h1 ? getComputedStyle(h1).fontFamily?.split(',')[0]?.trim().replace(/['"]/g, '') : null;
        })(),
        size_scale: ['14px', '16px', computed.fontSize || '16px', '24px', '32px', '48px'],
        weights: [400, 600, 700],
      },
      spacing: ['4px', '8px', '16px', '24px', '32px', '48px'],
      border_radius: (() => {
        const btn = document.querySelector('button,[role="button"],a.btn,.btn');
        return btn ? [getComputedStyle(btn).borderRadius] : ['4px'];
      })(),
    };
  });
}

/**
 * Extract page macro architecture (layout structure, grid, sections).
 */
async function extractMacroArchitecture(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header,nav,[role="banner"]');
    const main = document.querySelector('main,[role="main"]');
    const footer = document.querySelector('footer,[role="contentinfo"]');

    const sections = [];
    const sectionEls = document.querySelectorAll('section,[data-section],main > div');
    const sampled = Array.from(sectionEls).slice(0, 10);
    for (const el of sampled) {
      const heading = el.querySelector('h1,h2,h3');
      sections.push({
        tag: el.tagName.toLowerCase(),
        heading: heading?.textContent?.trim()?.substring(0, 80) || null,
        childCount: el.children.length,
      });
    }

    return {
      has_header: !!header,
      has_footer: !!footer,
      has_main: !!main,
      grid_system: document.querySelector('[class*="grid"]') ? 'css-grid' : 'flexbox',
      responsive_approach: document.querySelector('meta[name="viewport"]') ? 'mobile-first' : 'desktop-first',
      page_flow: sections.length > 3 ? 'multi-section' : 'single-column',
      sections,
    };
  });
}

/**
 * Extract copy patterns (headings, CTAs, content tone).
 */
async function extractCopyPatterns(page) {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
      .slice(0, 10)
      .map(h => h.textContent?.trim()?.substring(0, 120));

    const ctas = Array.from(document.querySelectorAll('button,a.btn,.btn,[role="button"],.cta'))
      .slice(0, 10)
      .map(el => el.textContent?.trim()?.substring(0, 60))
      .filter(t => t && t.length > 0 && t.length < 60);

    const paragraphs = Array.from(document.querySelectorAll('p'))
      .slice(0, 5)
      .map(p => p.textContent?.trim()?.substring(0, 200));

    return {
      headings,
      ctas,
      sample_paragraphs: paragraphs,
      word_count: document.body?.textContent?.split(/\s+/).length || 0,
    };
  });
}

/**
 * Extract component behaviors (interactive elements, forms, modals).
 */
async function extractComponentBehaviors(page) {
  return page.evaluate(() => {
    const components = [];

    // Detect navigation
    const nav = document.querySelector('nav,header nav,[role="navigation"]');
    if (nav) {
      const links = nav.querySelectorAll('a');
      components.push({
        type: 'navigation',
        link_count: links.length,
        has_dropdown: !!nav.querySelector('[class*="dropdown"],[class*="menu"]'),
      });
    }

    // Detect forms
    const forms = document.querySelectorAll('form');
    for (const form of Array.from(forms).slice(0, 3)) {
      components.push({
        type: 'form',
        field_count: form.querySelectorAll('input,textarea,select').length,
        has_submit: !!form.querySelector('[type="submit"],button'),
      });
    }

    // Detect cards
    const cards = document.querySelectorAll('[class*="card"],[class*="Card"]');
    if (cards.length > 0) {
      components.push({
        type: 'card_grid',
        count: cards.length,
        has_images: !!cards[0]?.querySelector('img'),
      });
    }

    // Detect hero
    const hero = document.querySelector('[class*="hero"],[class*="Hero"],.banner,[class*="banner"]');
    if (hero) {
      components.push({
        type: 'hero',
        has_background_image: !!getComputedStyle(hero).backgroundImage?.match(/url/),
        has_cta: !!hero.querySelector('button,a.btn,.btn'),
      });
    }

    return { components };
  });
}

/**
 * Detect tech stack from page source.
 */
async function extractTechStack(page) {
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'))
      .map(s => s.src)
      .slice(0, 20);

    const detected = {
      framework: 'unknown',
      css_approach: 'unknown',
      build_tool: 'unknown',
      key_libraries: [],
      rendering: document.querySelector('#__next') ? 'SSR' : 'CSR',
    };

    const scriptStr = scripts.join(' ').toLowerCase();
    const bodyHTML = document.body?.innerHTML?.substring(0, 5000) || '';

    // Framework detection
    if (document.querySelector('#__next') || scriptStr.includes('next')) detected.framework = 'Next.js';
    else if (document.querySelector('#app') && scriptStr.includes('vue')) detected.framework = 'Vue';
    else if (document.querySelector('[data-reactroot]') || scriptStr.includes('react')) detected.framework = 'React';
    else if (scriptStr.includes('angular')) detected.framework = 'Angular';
    else if (scriptStr.includes('svelte')) detected.framework = 'Svelte';

    // CSS detection
    if (bodyHTML.includes('tailwind') || document.querySelector('[class*="tw-"]') ||
        document.querySelector('[class*="flex "]')) detected.css_approach = 'Tailwind';
    else if (document.querySelector('[class*="MuiButton"]')) detected.css_approach = 'Material UI';
    else if (document.querySelector('[class*="chakra"]')) detected.css_approach = 'Chakra UI';

    return detected;
  });
}

// ============================================================================
// Main Extraction Pipeline
// ============================================================================

/**
 * Extract site DNA from a live URL using headless browser.
 *
 * @param {object} params
 * @param {string} params.url - The URL to extract DNA from
 * @param {string} [params.ventureId] - Optional venture UUID
 * @param {object} [params.supabase] - Optional Supabase client
 * @returns {object|null} The stored DNA record, or null on failure
 */
export async function extractSiteDna({ url, ventureId, supabase }) {
  if (!supabase) {
    supabase = createSupabaseServiceClient();
  }

  console.log('\n   Site DNA Extractor');
  console.log(`   URL: ${url}`);
  console.log(`   Venture: ${ventureId || 'none'}`);

  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.error('   Puppeteer not installed. Install with: npm install puppeteer');
    console.log('   Falling back to manual extraction mode.');
    return null;
  }

  let browser;
  try {
    browser = await puppeteer.default.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('   Loading page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Run extraction steps
    const extractionSteps = [];

    console.log('   Extracting design tokens...');
    const designTokens = await extractDesignTokens(page);
    extractionSteps.push({ step: 'design_tokens', status: 'success' });

    console.log('   Extracting macro architecture...');
    const macroArchitecture = await extractMacroArchitecture(page);
    extractionSteps.push({ step: 'macro_architecture', status: 'success' });

    console.log('   Extracting copy patterns...');
    const copyPatterns = await extractCopyPatterns(page);
    extractionSteps.push({ step: 'copy_patterns', status: 'success' });

    console.log('   Extracting component behaviors...');
    const componentBehaviors = await extractComponentBehaviors(page);
    extractionSteps.push({ step: 'component_behaviors', status: 'success' });

    console.log('   Detecting tech stack...');
    const techStack = await extractTechStack(page);
    extractionSteps.push({ step: 'tech_stack', status: 'success' });

    // Assemble DNA JSON
    const dnaJson = {
      design_tokens: designTokens,
      macro_architecture: macroArchitecture,
      copy_patterns: copyPatterns,
      component_behaviors: componentBehaviors,
      tech_stack: techStack,
      extracted_at: new Date().toISOString(),
      source_url: url,
    };

    // Calculate quality score
    const completedSteps = extractionSteps.filter(s => s.status === 'success').length;
    const qualityScore = Math.round((completedSteps / 5) * 100);

    // Store in database
    const dnaRecord = {
      venture_id: ventureId || null,
      reference_url: url,
      dna_json: dnaJson,
      extraction_steps: extractionSteps,
      quality_score: qualityScore,
      status: 'completed',
      created_by: 'SRIP_DNA_EXTRACTOR',
    };

    const { data, error } = await supabase
      .from('srip_site_dna')
      .insert(dnaRecord)
      .select('id, quality_score, status');

    if (error) {
      console.error(`   DB insert failed: ${error.message}`);
      return null;
    }

    const result = data[0];
    console.log(`\n   DNA stored: ${result.id}`);
    console.log(`   Quality: ${result.quality_score}/100`);
    console.log(`   Steps completed: ${completedSteps}/5`);

    return result;
  } catch (err) {
    console.error(`   Extraction failed: ${err.message}`);
    if (err.message.includes('net::ERR_') || err.message.includes('Navigation timeout')) {
      console.log('   Site may be blocking headless browsers. Use manual fallback.');
    }
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Create a Site DNA record from manually provided data (fallback path).
 *
 * @param {object} params
 * @param {string} params.url - Reference URL
 * @param {string} [params.ventureId] - Optional venture UUID
 * @param {object} params.manualData - Manual DNA data
 * @param {object} [params.manualData.colors] - { primary, secondary }
 * @param {string} [params.manualData.fontFamily] - Primary font
 * @param {string} [params.manualData.layoutStyle] - Layout description
 * @param {string} [params.manualData.tone] - Brand tone
 * @param {string} [params.manualData.screenshotPath] - Path to uploaded screenshot
 * @param {object} [params.supabase] - Optional Supabase client
 * @returns {object|null} The stored DNA record, or null on failure
 */
export async function createManualDna({ url, ventureId, manualData, supabase }) {
  if (!supabase) {
    supabase = createSupabaseServiceClient();
  }

  console.log('\n   Manual DNA Entry');
  console.log(`   URL: ${url}`);

  const dnaJson = {
    design_tokens: {
      colors: {
        primary: manualData.colors?.primary || null,
        secondary: manualData.colors?.secondary || null,
        accent: null,
        background: '#ffffff',
        text: '#333333',
        additional: [],
      },
      typography: {
        font_family: manualData.fontFamily || 'sans-serif',
      },
    },
    macro_architecture: {
      layout_style: manualData.layoutStyle || 'unknown',
    },
    copy_patterns: {
      tone: manualData.tone || null,
    },
    component_behaviors: { components: [] },
    tech_stack: { framework: 'unknown', css_approach: 'unknown' },
    extracted_at: new Date().toISOString(),
    source_url: url,
    extraction_method: 'manual',
  };

  const extractionSteps = [
    { step: 'manual_entry', status: 'success' },
  ];

  const qualityScore = 40; // Manual entries get lower quality score

  const dnaRecord = {
    venture_id: ventureId || null,
    reference_url: url,
    screenshot_path: manualData.screenshotPath || null,
    dna_json: dnaJson,
    extraction_steps: extractionSteps,
    quality_score: qualityScore,
    status: 'completed',
    created_by: 'SRIP_MANUAL_ENTRY',
  };

  const { data, error } = await supabase
    .from('srip_site_dna')
    .insert(dnaRecord)
    .select('id, quality_score, status');

  if (error) {
    console.error(`   DB insert failed: ${error.message}`);
    return null;
  }

  const result = data[0];
  console.log(`   Manual DNA stored: ${result.id}`);
  console.log(`   Quality: ${result.quality_score}/100 (manual entry)`);

  return result;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
if (args.length > 0 && args[0] !== '--help') {
  const url = args[0];
  const ventureId = args[1] || null;

  extractSiteDna({ url, ventureId })
    .then(result => {
      if (result) {
        console.log('\n   ✅ DNA extraction complete');
        process.exit(0);
      } else {
        console.log('\n   ❌ Extraction failed — try manual entry');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('Fatal:', err.message);
      process.exit(1);
    });
} else if (args[0] === '--help') {
  console.log('Usage: node site-dna-extractor.mjs <url> [ventureId]');
  console.log('  url       - The website URL to extract DNA from');
  console.log('  ventureId - Optional venture UUID for ownership');
}
