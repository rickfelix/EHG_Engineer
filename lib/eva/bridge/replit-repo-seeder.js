/**
 * Replit Repo Seeder
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001
 *
 * Seeds a Replit-connected GitHub repo with curated reference documents
 * extracted from venture pipeline artifacts (Stages 0-19).
 *
 * Flow:
 *   1. Chairman creates blank Replit project, publishes to GitHub
 *   2. Chairman gives EHG the GitHub URL
 *   3. This module clones the repo, commits docs/ folder, pushes
 *   4. Replit syncs and has all reference files available
 *   5. Build prompts reference docs/ instead of inlining content
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  formatArtifactContent,
  extractArchitectureSection,
  normalizeGroupKey,
  summarizeContent,
} from './replit-format-strategies.js';

/**
 * Parse content that may be a JSON string.
 */
function parseContent(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return null; }
    }
  }
  return null;
}

function findGroup(groups, key) {
  const normalized = normalizeGroupKey(key);
  return groups.find(g => normalizeGroupKey(g.group_key) === normalized);
}

// ── Document Generators ────────────────────────────

function generateBrandingDoc(groups) {
  const lines = ['# Branding & Personas\n'];

  // Personas from S10
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    const personaArt = buildGroup.artifacts.find(a =>
      a.artifact_type === 'identity_persona_brand' || a.lifecycle_stage === 10
    );
    if (personaArt?.content) {
      const data = parseContent(personaArt.content) || {};
      lines.push('## Customer Personas\n');

      const personas = data.customerPersonas || data.personas || [];
      if (Array.isArray(personas)) {
        for (const p of personas.slice(0, 5)) {
          lines.push(`### ${p.name || 'Persona'}`);
          if (p.demographics?.role) lines.push(`- **Role**: ${p.demographics.role}`);
          if (p.demographics?.age) lines.push(`- **Age**: ${p.demographics.age}`);
          if (p.goals?.length) lines.push(`- **Goals**: ${p.goals.slice(0, 4).join('; ')}`);
          if (p.painPoints?.length) lines.push(`- **Pain Points**: ${p.painPoints.slice(0, 4).join('; ')}`);
          if (p.techStack) lines.push(`- **Tech Stack**: ${p.techStack}`);
          lines.push('');
        }
      }

      // Brand genome
      if (data.brandGenome) {
        lines.push('## Brand Genome\n');
        const bg = data.brandGenome;
        if (bg.personality) lines.push(`- **Personality**: ${bg.personality}`);
        if (bg.values?.length) lines.push(`- **Values**: ${bg.values.join(', ')}`);
        if (bg.voice) lines.push(`- **Voice**: ${bg.voice}`);
        if (bg.archetype) lines.push(`- **Archetype**: ${bg.archetype}`);
        lines.push('');
      }
    }
  }

  // Naming & Visual Identity from S11
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    const namingArt = audienceGroup.artifacts.find(a =>
      a.artifact_type === 'identity_naming_visual'
    );
    if (namingArt?.content) {
      const data = parseContent(namingArt.content) || {};

      lines.push('## Product Name\n');
      const selectedName = data.decision?.selectedName || data.decision?.name;
      if (selectedName) {
        lines.push(`**Selected**: ${selectedName}`);
        if (data.decision?.rationale) lines.push(`\n${data.decision.rationale}`);
      } else if (data.candidates?.length) {
        lines.push(`**Top candidate**: ${data.candidates[0].name || data.candidates[0]}`);
      }
      lines.push('');

      // Colors
      const colors = data.visualIdentity?.colorPalette;
      if (colors?.length) {
        lines.push('## Color Palette\n');
        lines.push('| Color | Hex | Usage |');
        lines.push('|-------|-----|-------|');
        for (const c of colors) {
          lines.push(`| ${c.name} | \`${c.hex}\` | ${c.usage || ''} |`);
        }
        lines.push('');
      }

      // Typography
      const typo = data.visualIdentity?.typography;
      if (typo) {
        lines.push('## Typography\n');
        if (Array.isArray(typo)) {
          for (const t of typo) {
            lines.push(`- **${t.name || t.role}**: \`${t.font || t.fontFamily || t.family}\` — ${t.usage || ''}`);
          }
        } else if (typeof typo === 'object') {
          for (const [k, v] of Object.entries(typo)) {
            lines.push(`- **${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
          }
        }
        lines.push('');
      }

      // Brand expression
      if (data.brandExpression) {
        lines.push('## Brand Expression\n');
        if (data.brandExpression.tagline) lines.push(`- **Tagline**: "${data.brandExpression.tagline}"`);
        if (data.brandExpression.toneKeywords?.length) lines.push(`- **Tone**: ${data.brandExpression.toneKeywords.join(', ')}`);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generateArchitectureDoc(groups) {
  const lines = ['# Technical Architecture\n'];
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (!archGroup) return lines.join('\n');

  for (const artifact of archGroup.artifacts) {
    if (!artifact.content) continue;
    if (artifact.artifact_type === 'blueprint_wireframes') continue; // separate doc

    lines.push(`## ${artifact.title || artifact.artifact_type}\n`);
    lines.push(formatArtifactContent(artifact.content));
    lines.push('');
  }

  return lines.join('\n');
}

function generateWireframesDoc(groups) {
  const lines = ['# Application Wireframes\n'];
  const archGroup = findGroup(groups, 'how_to_build_it');
  if (!archGroup) return '';

  const wfArt = archGroup.artifacts.find(a =>
    a.artifact_type === 'blueprint_wireframes'
  );
  if (!wfArt?.content) return '';

  const data = parseContent(wfArt.content) || {};
  const screens = data.wireframes?.screens || data.screens || [];
  if (screens.length === 0) return '';

  lines.push(`Total screens: ${screens.length}\n`);

  for (const screen of screens) {
    lines.push(`## ${screen.name || 'Screen'}`);
    if (screen.purpose) lines.push(`**Purpose**: ${screen.purpose}`);
    if (screen.persona) lines.push(`**Primary user**: ${screen.persona}`);
    lines.push('');
    if (screen.ascii_layout) {
      lines.push('```');
      lines.push(screen.ascii_layout);
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateContextDoc(groups) {
  const lines = ['# Product Context\n'];

  // S1 Idea brief
  const buildGroup = findGroup(groups, 'what_to_build');
  if (buildGroup) {
    const ideaArt = buildGroup.artifacts.find(a => a.artifact_type === 'truth_idea_brief');
    if (ideaArt?.content) {
      const data = parseContent(ideaArt.content) || {};
      lines.push('## Problem & Value Proposition\n');
      if (data.problemStatement) lines.push(`**Problem**: ${data.problemStatement}\n`);
      if (data.valueProp) lines.push(`**Value Proposition**: ${data.valueProp}\n`);
      if (data.targetMarket) lines.push(`**Target Market**: ${data.targetMarket}\n`);
      if (data.description) lines.push(`${data.description}\n`);
    }
  }

  // S4 Competitive analysis
  const audienceGroup = findGroup(groups, 'who_its_for');
  if (audienceGroup) {
    const compArt = audienceGroup.artifacts.find(a =>
      a.artifact_type === 'truth_competitive_analysis'
    );
    if (compArt?.content) {
      const data = parseContent(compArt.content) || {};
      const competitors = data.competitors || [];
      if (competitors.length > 0) {
        lines.push('## Competitive Landscape\n');
        for (const c of competitors.slice(0, 5)) {
          const name = c.name || c.company || 'Competitor';
          const threat = c.threat || c.threatLevel || '?';
          lines.push(`- **${name}** (Threat: ${threat}): ${c.position || c.keyStrength || ''}`);
        }
        lines.push('');
      }
    }
  }

  // S13 Product roadmap
  if (buildGroup) {
    const roadmapArt = buildGroup.artifacts.find(a =>
      a.artifact_type === 'blueprint_product_roadmap'
    );
    if (roadmapArt?.content) {
      const data = parseContent(roadmapArt.content) || {};
      const milestones = data.milestones || [];
      if (milestones.length > 0) {
        lines.push('## Product Roadmap\n');
        for (const m of milestones.slice(0, 6)) {
          const name = m.name || m.title || 'Milestone';
          const deliverables = m.deliverables?.slice(0, 3).join(', ') || '';
          lines.push(`- **${name}** (${m.priority || 'planned'}): ${deliverables}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generatePricingDoc(groups) {
  const costGroup = findGroup(groups, 'what_it_costs');
  if (!costGroup?.artifacts?.length) return '';

  const lines = ['# Pricing Model\n'];
  for (const artifact of costGroup.artifacts) {
    if (!artifact.content) continue;
    lines.push(`## ${artifact.title || artifact.artifact_type}\n`);
    lines.push(formatArtifactContent(artifact.content));
    lines.push('');
  }

  return lines.join('\n');
}

// ── Initial Prompt Generator ───────────────────────

/**
 * Generate the "blank slate" initial prompt for creating the Replit project.
 */
export function generateInitialPrompt(ventureName, framework = 'Vite') {
  return `Create a new ${framework} + TypeScript project called "${ventureName}".

Setup:
- ${framework} with TypeScript (strict mode)
- Tailwind CSS for styling
- React Router for navigation
- A clean folder structure: src/components/, src/pages/, src/lib/

Do NOT build any features yet. Just:
1. Initialize the project with the tech stack above
2. Create a basic App.tsx with a router placeholder
3. Add a simple home page that says "${ventureName}" with a subtitle
4. Ensure the dev server runs without errors

I will add reference documents and feature prompts in the next steps.`;
}

// ── Main Seeder Function ───────────────────────────

/**
 * Seed a GitHub repo with reference documents from venture artifacts.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string} repoUrl - GitHub repo URL (e.g., https://github.com/user/repo.git)
 * @param {object} [options]
 * @param {string} [options.cloneDir] - Where to clone (default: temp dir)
 * @returns {Promise<{success: boolean, docsCommitted: string[], errors: string[]}>}
 */
export async function seedRepo(ventureId, repoUrl, options = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const errors = [];
  const docsCommitted = [];

  // Fetch all artifacts via the RPC
  const { data, error } = await supabase.rpc('export_blueprint_review', { p_venture_id: ventureId });
  if (error) throw new Error(`export_blueprint_review failed: ${error.message}`);
  if (!data?.groups?.length) throw new Error('No planning artifacts found');

  const groups = data.groups;

  // Get venture name
  const { data: venture } = await supabase
    .from('ventures').select('name').eq('id', ventureId).single();
  const ventureName = venture?.name || 'Venture';

  // Determine clone directory
  const match = repoUrl.match(/\/([^/]+?)(?:\.git)?$/);
  const repoName = match?.[1] || 'venture-repo';
  const parentDir = options.cloneDir || process.cwd();
  const repoDir = join(parentDir, repoName);

  // Clone or use existing
  if (!existsSync(repoDir)) {
    execSync(`git clone "${repoUrl}" "${repoDir}"`, { encoding: 'utf-8', timeout: 30000 });
  }

  // Create docs directory
  const docsDir = join(repoDir, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Generate and write each document
  const docs = [
    { name: 'branding.md', generator: () => generateBrandingDoc(groups), required: true },
    { name: 'architecture.md', generator: () => generateArchitectureDoc(groups), required: true },
    { name: 'wireframes.md', generator: () => generateWireframesDoc(groups), required: true },
    { name: 'context.md', generator: () => generateContextDoc(groups), required: false },
    { name: 'pricing.md', generator: () => generatePricingDoc(groups), required: false },
  ];

  for (const doc of docs) {
    try {
      const content = doc.generator();
      if (!content || content.trim().length < 20) {
        if (doc.required) errors.push(`${doc.name}: no content generated`);
        continue;
      }
      writeFileSync(join(docsDir, doc.name), content);
      docsCommitted.push(doc.name);
    } catch (err) {
      errors.push(`${doc.name}: ${err.message}`);
    }
  }

  // Update replit.md to reference docs/
  const replitMd = `# ${ventureName}

This project was scaffolded by Replit and enriched with planning documents from EHG.

## Reference Documents

All planning artifacts are in the \`docs/\` folder:

- **docs/branding.md** — Product name, color palette, typography, personas, brand voice
- **docs/architecture.md** — Tech stack, data model, API contract, schema
- **docs/wireframes.md** — All screen layouts with ASCII mockups
- **docs/context.md** — Problem statement, value proposition, competitive landscape, roadmap
- **docs/pricing.md** — Pricing model and tiers (if applicable)

## Build Instructions

When given a feature prompt, always:
1. Read the relevant docs/ file referenced in the prompt
2. Follow the branding (colors, typography, product name) from docs/branding.md
3. Match the wireframe layout from docs/wireframes.md
4. Use the data model from docs/architecture.md for database operations

## Coding Standards
- TypeScript strict mode
- Proper error handling on all API calls
- Responsive design (mobile-first)
- Semantic HTML with ARIA labels
- Use environment variables for all secrets
`;

  writeFileSync(join(repoDir, 'replit.md'), replitMd);
  docsCommitted.push('replit.md');

  // Git add, commit, push
  try {
    execSync('git add docs/ replit.md', { cwd: repoDir, encoding: 'utf-8' });
    execSync(
      'git commit -m "docs: seed reference documents from EHG venture pipeline\n\nAdds branding, architecture, wireframes, context, and pricing\ndocuments extracted from Stages 0-19 planning artifacts."',
      { cwd: repoDir, encoding: 'utf-8' }
    );
    execSync('git push', { cwd: repoDir, encoding: 'utf-8', timeout: 30000 });
  } catch (err) {
    errors.push(`git push failed: ${err.message}`);
  }

  return { success: errors.length === 0, docsCommitted, errors, repoDir, ventureName };
}

// ── Build Prompt Generator (References docs/) ──────

/**
 * Generate build prompts that reference the seeded docs/ files.
 *
 * @param {string} ventureId
 * @returns {Promise<{initial: string, features: Array<{title: string, prompt: string}>}>}
 */
export async function generateBuildPrompts(ventureId) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc('export_blueprint_review', { p_venture_id: ventureId });
  if (error) throw new Error(`export_blueprint_review failed: ${error.message}`);

  const groups = data?.groups || [];
  const { data: venture } = await supabase
    .from('ventures').select('name').eq('id', ventureId).single();
  const ventureName = venture?.name || 'Venture';

  // Extract wireframe screens
  const archGroup = findGroup(groups, 'how_to_build_it');
  const wfArt = archGroup?.artifacts?.find(a => a.artifact_type === 'blueprint_wireframes');
  const wfData = parseContent(wfArt?.content) || {};
  const screens = wfData.wireframes?.screens || [];

  const features = screens.map((screen, i) => {
    const name = screen.name || `Screen ${i + 1}`;
    return {
      title: name,
      prompt: `Build the "${name}" screen.

Reference files:
- See docs/wireframes.md section "${name}" for the layout
- See docs/branding.md for colors and typography
- See docs/architecture.md for data model and API endpoints

${screen.purpose ? `Purpose: ${screen.purpose}` : ''}
${screen.persona ? `Primary user: ${screen.persona}` : ''}

${screens.length > 1 ? `This is screen ${i + 1} of ${screens.length}.${i > 0 ? ` Build after: ${screens[i - 1].name || `Screen ${i}`}` : ''}` : ''}

Instructions:
- Match the wireframe layout as closely as possible
- Use the brand colors from docs/branding.md
- Implement all interactive elements shown in the wireframe
- Ensure responsive design (mobile-first)
- Test the screen works end-to-end before proceeding
- Checkpoint after completion`,
    };
  });

  return {
    initial: generateInitialPrompt(ventureName),
    features,
  };
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const ventureId = args[1];
  const repoUrl = args[2];

  if (!cmd || args.includes('--help')) {
    console.error(`
Replit Repo Seeder

Commands:
  seed <venture-id> <repo-url>     Clone repo, commit docs/, push
  prompts <venture-id>             Generate build prompts (after seed)
  initial <venture-name>           Generate initial blank-slate prompt

Examples:
  node lib/eva/bridge/replit-repo-seeder.js seed <id> https://github.com/user/repo.git
  node lib/eva/bridge/replit-repo-seeder.js prompts <id>
  node lib/eva/bridge/replit-repo-seeder.js initial "CronRead"
`);
    process.exit(0);
  }

  if (cmd === 'initial') {
    console.log(generateInitialPrompt(ventureId || 'MyApp'));
    process.exit(0);
  }

  if (cmd === 'seed') {
    if (!ventureId || !repoUrl) {
      console.error('Usage: seed <venture-id> <repo-url>');
      process.exit(1);
    }
    seedRepo(ventureId, repoUrl).then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }

  if (cmd === 'prompts') {
    if (!ventureId) {
      console.error('Usage: prompts <venture-id>');
      process.exit(1);
    }
    generateBuildPrompts(ventureId).then(result => {
      console.log('=== INITIAL PROMPT ===\n');
      console.log(result.initial);
      console.log('\n');
      for (let i = 0; i < result.features.length; i++) {
        console.log(`=== FEATURE ${i + 1}: ${result.features[i].title} ===\n`);
        console.log(result.features[i].prompt);
        console.log('\n');
      }
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  }
}
