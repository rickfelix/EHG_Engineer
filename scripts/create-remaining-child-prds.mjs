#!/usr/bin/env node

/**
 * Create PRDs for Remaining Child SDs
 * Creates PRDs for the remaining three child SDs of SD-STAGE4-AI-FIRST-UX-001
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const childSDs = [
  {
    id: 'SD-STAGE4-AGENT-PROGRESS-001',
    title: 'Stage 4 Agent Progress Tracking Infrastructure - Technical PRD'
  },
  {
    id: 'SD-STAGE4-RESULTS-DISPLAY-001',
    title: 'Stage 4 AI Results Display Integration - Technical PRD'
  },
  {
    id: 'SD-STAGE4-ERROR-HANDLING-001',
    title: 'Stage 4 Error Handling & Fallback Mechanisms - Technical PRD'
  }
];

async function createPRD(sdId, title) {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Creating PRD for ${sdId}...`);

    const scriptPath = join(__dirname, 'add-prd-to-database.js');
    const child = spawn('node', [scriptPath, sdId, title], {
      stdio: 'inherit',
      cwd: __dirname
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ PRD created successfully for ${sdId}`);
        resolve();
      } else {
        console.error(`❌ Failed to create PRD for ${sdId} (exit code: ${code})`);
        reject(new Error(`Failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Error creating PRD for ${sdId}:`, error.message);
      reject(error);
    });
  });
}

async function main() {
  console.log('Creating PRDs for remaining child SDs...\n');
  console.log('Parent SD: SD-STAGE4-AI-FIRST-UX-001');
  console.log('Child SDs to process:', childSDs.length);

  let successCount = 0;
  let failureCount = 0;

  for (const child of childSDs) {
    try {
      await createPRD(child.id, child.title);
      successCount++;
      // Add delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      failureCount++;
      console.error(`Failed to create PRD for ${child.id}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`✅ Successfully created: ${successCount} PRDs`);
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount} PRDs`);
  }

  console.log('\n📋 Next Steps:');
  console.log('1. Review generated PRDs and user stories');
  console.log('2. Update PRDs with specific technical requirements');
  console.log('3. Create PLAN→EXEC handoffs for each child SD');
  console.log('4. Begin parallel implementation of child SDs');

  console.log('\n✨ All child SDs now have:');
  console.log('   - Strategic Directives (created)');
  console.log('   - Product Requirements Documents (created)');
  console.log('   - User Stories (auto-generated)');
  console.log('   - Ready for implementation phase');
}

main().catch(console.error);