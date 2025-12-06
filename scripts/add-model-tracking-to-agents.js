#!/usr/bin/env node
/**
 * Add Model Tracking Section to All Agent Files
 * Inserts the auto-logging instruction after the frontmatter
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AGENTS_DIR = path.join(__dirname, '..', '.claude', 'agents');

const TRACKING_SECTION = `
## Model Usage Tracking (Auto-Log)

**FIRST STEP**: Before doing any other work, log your model identity by running:

\`\`\`bash
node scripts/track-model-usage.js "AGENT_PLACEHOLDER" "MODEL_NAME" "MODEL_ID" "SD_ID" "PHASE"
\`\`\`

Get your MODEL_NAME and MODEL_ID from your system context (e.g., "Sonnet 4.5", "claude-sonnet-4-5-20250929"). Replace SD_ID and PHASE with actual values or use "STANDALONE" and "UNKNOWN" if not applicable.

`;

function addTrackingToAgent(filePath) {
  const filename = path.basename(filePath);

  // Skip non-agent files
  if (filename.startsWith('_') || filename === 'README.md' || filename === 'AGENT-MANIFEST.md') {
    console.log(`  Skipping ${filename}`);
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check if already has tracking section
  if (content.includes('Model Usage Tracking')) {
    console.log(`  ${filename} - Already has tracking section`);
    return false;
  }

  // Find the end of frontmatter
  const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---\n/);
  if (!frontmatterMatch) {
    console.log(`  ${filename} - No frontmatter found, skipping`);
    return false;
  }

  const frontmatter = frontmatterMatch[0];
  const restOfContent = content.slice(frontmatter.length);

  // Get agent name from filename
  const agentName = filename.replace('.md', '');

  // Customize tracking section with agent name
  const customizedSection = TRACKING_SECTION.replace('AGENT_PLACEHOLDER', agentName);

  // Insert tracking section after frontmatter, before the rest
  const newContent = frontmatter + customizedSection + restOfContent;

  fs.writeFileSync(filePath, newContent);
  console.log(`  ✅ ${filename} - Added tracking section`);
  return true;
}

async function main() {
  console.log('Adding Model Tracking to Agent Files\n');
  console.log('Directory:', AGENTS_DIR);
  console.log('');

  const files = fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md'));
  let modified = 0;

  for (const file of files) {
    const filePath = path.join(AGENTS_DIR, file);
    if (addTrackingToAgent(filePath)) {
      modified++;
    }
  }

  console.log(`\nModified ${modified} agent files`);
}

main().catch(console.error);
