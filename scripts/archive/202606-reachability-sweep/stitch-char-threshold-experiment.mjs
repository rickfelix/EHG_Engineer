/**
 * Stitch Character Threshold Experiment
 *
 * Finds the maximum prompt length that generates screens reliably.
 * Tests lengths from 2000-3500 chars with 4 trials each.
 *
 * Usage: node scripts/stitch-char-threshold-experiment.mjs [--trials 4] [--delay 15000]
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const { createProject, generateScreens } = await import('../lib/eva/bridge/stitch-client.js');

const args = process.argv.slice(2);
const trialsPerLength = parseInt(args.find((_, i, a) => a[i - 1] === '--trials') || '4', 10);
const delayMs = parseInt(args.find((_, i, a) => a[i - 1] === '--delay') || '15000', 10);

const CHAR_LENGTHS = [2000, 2250, 2500, 2750, 3000, 3250, 3500];

// Build a realistic prompt at a target char length, mirroring buildScreenPrompt() structure
function buildTestPrompt(targetLength, screenName, deviceType) {
  const sections = {
    intro: `Design a ${screenName} for TestVenture.`,
    purpose: `Purpose: Main screen for managing ${screenName.toLowerCase()} with quick actions, status indicators, and navigation.`,
    layout: `Layout: [Header: logo + nav + search + avatar] [Sidebar: Dashboard, Projects, Upload, Analytics, Team, Settings, Billing] [Main: stats row (4 cards) + data table with pagination] [Footer: status + help]`,
    brand: `Colors: #2563EB, #10B981, #F59E0B, #EF4444, #1E293B, #F8FAFC. Typography: Inter. Brand: innovative and approachable.`,
    designRef: `Design reference: Clean SaaS dashboard style with rounded corners (16px), subtle shadows, generous whitespace, card-based layouts.`,
    behavior: `Interactions: Cards clickable with hover state. Table rows selectable. Sidebar collapses on mobile.`,
    context: `Key components: stats cards, data table, search bar, filters, action buttons, sidebar navigation, header with notifications.`,
  };

  let prompt = [
    sections.intro,
    sections.purpose,
    '',
    sections.layout,
    '',
    sections.brand,
    '',
    sections.designRef,
    '',
    sections.behavior,
    '',
    sections.context,
  ].join('\n');

  // Pad or trim to exact target length with realistic content
  const padding = ' Design guidelines: Use a consistent 8px grid system. Cards have 24px internal padding. Interactive elements use 150ms transitions. Data tables use alternating row colors with hover highlights. Charts follow the brand color palette with 60/30/10 distribution. Empty states show centered illustrations with descriptive text and a primary action CTA. Loading states use skeleton screens. Error states are inline with red accent border. Focus rings on all interactive elements for accessibility. Mobile breakpoint at 640px switches to bottom tab navigation and stacked card layout. Tablet at 1024px uses a collapsed sidebar. Desktop at 1280px shows the full sidebar and multi-column layouts.';

  while (prompt.length < targetLength) {
    prompt += padding;
  }
  prompt = prompt.substring(0, targetLength);

  return prompt;
}

// Main experiment
async function runExperiment() {
  console.log('=== STITCH CHARACTER THRESHOLD EXPERIMENT ===');
  console.log(`Trials per length: ${trialsPerLength}`);
  console.log(`Delay between trials: ${delayMs}ms`);
  console.log(`Lengths to test: ${CHAR_LENGTHS.join(', ')}`);
  console.log('');

  // Create a fresh project
  console.log('Creating fresh Stitch project...');
  const project = await createProject({ name: 'Char Threshold Experiment', ventureId: 'char-threshold-exp-' + Date.now() });
  console.log(`Project: ${project.project_id}\n`);

  const results = {};
  const screens = ['Dashboard', 'Projects', 'Upload', 'Settings'];
  const devices = ['MOBILE', 'DESKTOP'];

  for (const charLength of CHAR_LENGTHS) {
    console.log(`--- Testing ${charLength} chars ---`);
    const trials = [];

    // Build prompts for this length
    const prompts = [];
    for (let t = 0; t < trialsPerLength; t++) {
      const screen = screens[t % screens.length];
      const device = devices[t % devices.length];
      prompts.push({
        text: buildTestPrompt(charLength, screen, device),
        deviceType: device,
      });
    }

    // Run all trials for this length
    const trialResults = await generateScreens(project.project_id, prompts);

    let successes = 0;
    let errors = 0;
    for (const r of trialResults) {
      const ok = r.status === 'returned' || r.status === 'fired';
      if (ok) successes++;
      else errors++;
      trials.push({
        deviceType: r.deviceType,
        status: r.status,
        attempt: r.attempt,
        error: r.error || null,
      });
    }

    const successRate = Math.round((successes / trialResults.length) * 100);
    console.log(`  Result: ${successes}/${trialResults.length} success (${successRate}%)`);
    if (errors > 0) {
      const retried = trialResults.filter(r => r.attempt > 1).length;
      console.log(`  Errors: ${errors}, Retried: ${retried}`);
    }
    console.log('');

    results[charLength] = {
      charLength,
      trials: trialResults.length,
      successes,
      errors,
      successRate,
      details: trials,
    };
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log('Length  | Success | Rate');
  console.log('-----  | ------- | ----');
  let safeThreshold = 0;
  for (const len of CHAR_LENGTHS) {
    const r = results[len];
    const marker = r.successRate === 100 ? ' *' : '';
    console.log(`${len}   | ${r.successes}/${r.trials}     | ${r.successRate}%${marker}`);
    if (r.successRate === 100) safeThreshold = len;
  }

  // Apply 10% safety margin
  const recommendedLimit = Math.floor(safeThreshold * 0.9);
  console.log('');
  console.log(`Highest 100% success: ${safeThreshold} chars`);
  console.log(`Recommended limit (90%): ${recommendedLimit} chars`);
  console.log('');
  console.log(`THRESHOLD=${recommendedLimit}`);

  return { results, safeThreshold, recommendedLimit };
}

runExperiment().catch(err => {
  console.error('Experiment failed:', err.message);
  process.exit(1);
});
