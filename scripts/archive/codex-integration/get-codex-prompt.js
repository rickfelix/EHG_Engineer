#!/usr/bin/env node

/**
 * Get the OpenAI Codex Prompt
 * Retrieves and displays the last generated prompt for easy copying
 */

import { createClient as _createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

const PRD_ID = 'PRD-CODEX-TEST-1758341001565';
const HANDOFF_ID = 'CODEX-1758341064216';

// Reconstruct the prompt exactly as it was generated
const prompt = `
=== LEO PROTOCOL HANDOFF TO OPENAI CODEX ===
Handoff ID: ${HANDOFF_ID}
Database: ${process.env.NEXT_PUBLIC_SUPABASE_URL}
PRD ID: ${PRD_ID}
Title: Technical Implementation: Add Timestamp Utility Function
Generated: ${new Date().toISOString()}

CONTEXT:
You are the read-only Codex builder in the LEO Protocol dual-lane architecture.
Your role is to generate patches without direct write access.

DATABASE ACCESS (Read-Only):
\`\`\`javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  '${process.env.NEXT_PUBLIC_SUPABASE_URL}',
  '${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}'
);

// Query the full PRD
const { data: prd } = await supabase
  .from('product_requirements_v2')
  .select('*')
  .eq('id', '${PRD_ID}')
  .single();
\`\`\`

REQUIREMENTS TO IMPLEMENT:

Functional Requirements:
1. Create getTimestamp() function that returns current time in ISO 8601 format
2. Add formatTimestamp(date, format) function for custom formatting
3. Include getTimestampWithTimezone(timezone) for timezone-specific timestamps
4. Provide parseTimestamp(string) to parse timestamp strings

Technical Requirements:
1. Use Node.js built-in Date API
2. Export as CommonJS and ES Module
3. Include JSDoc documentation

Implementation Checklist:
1. Create src/utils/timestamp.js file
2. Implement getTimestamp() function
3. Implement formatTimestamp() function
4. Implement getTimestampWithTimezone() function
5. Implement parseTimestamp() function

FILES TO MODIFY:
- src/utils/timestamp.js
- src/utils/timestamp.test.js

OUTPUT REQUIREMENTS:

1. Generate artifacts in /tmp/codex-artifacts/:
   - changes-{timestamp}.patch (unified diff format)
   - sbom-{timestamp}.cdx.json (CycloneDX 1.5)
   - attestation-{timestamp}.intoto (in-toto v1.0)
   - manifest-{timestamp}.json with:
     {
       "handoff_id": "${HANDOFF_ID}",
       "prd_id": "${PRD_ID}",
       "timestamp": "{ISO-8601}",
       "files_modified": ["src/utils/timestamp.js"],
       "task_description": "Implement timestamp utility functions"
     }

2. Use git diff format for patches:
   \`\`\`diff
   --- a/src/utils/timestamp.js
   +++ b/src/utils/timestamp.js
   @@ -0,0 +1,40 @@
   \`\`\`

3. Mark completion with: [CODEX-READY:${PRD_ID}]

TEST SCENARIOS TO CONSIDER:
1. Default timestamp: getTimestamp() returns valid ISO 8601 string
2. Custom format: formatTimestamp() applies custom format correctly
3. Timezone handling: getTimestampWithTimezone() returns correct time for timezone

IMPORTANT CONSTRAINTS:
- You CANNOT directly modify files (read-only)
- Generate patches that can be applied with 'git apply'
- Ensure all changes maintain backward compatibility
- Include appropriate error handling
- Follow existing code style and conventions

Please analyze the codebase and generate the complete artifact bundle.
===`.trim();

console.log(chalk.cyan('═'.repeat(70)));
console.log(chalk.cyan.bold('📋 OPENAI CODEX PROMPT'));
console.log(chalk.cyan('═'.repeat(70)));

console.log(chalk.yellow('\n📌 Quick Info:'));
console.log(`  PRD ID: ${chalk.white(PRD_ID)}`);
console.log(`  Handoff ID: ${chalk.white(HANDOFF_ID)}`);
console.log(`  Task: ${chalk.white('Implement timestamp utility functions')}`);

// Try to copy to clipboard
try {
  if (process.platform === 'darwin') {
    execSync('pbcopy', { input: prompt });
    console.log(chalk.green('\n✅ Prompt copied to clipboard!'));
    console.log(chalk.gray('   Just paste with Cmd+V in OpenAI Codex'));
  } else if (process.platform === 'linux') {
    try {
      execSync('xclip -selection clipboard', { input: prompt });
      console.log(chalk.green('\n✅ Prompt copied to clipboard!'));
      console.log(chalk.gray('   Just paste with Ctrl+V in OpenAI Codex'));
    } catch {
      console.log(chalk.yellow('\n⚠️  Could not copy to clipboard (xclip not installed)'));
    }
  } else if (process.platform === 'win32') {
    // Save to file for Windows
    const tempFile = 'C:\\temp\\codex-prompt.txt';
    fs.mkdirSync('C:\\temp', { recursive: true });
    fs.writeFileSync(tempFile, prompt);
    execSync(`clip < ${tempFile}`);
    console.log(chalk.green('\n✅ Prompt copied to clipboard!'));
    console.log(chalk.gray('   Just paste with Ctrl+V in OpenAI Codex'));
  }
} catch (_error) {
  console.log(chalk.yellow('\n⚠️  Could not copy to clipboard automatically'));
}

// Save to file as backup
const promptFile = '/tmp/codex-prompt.txt';
fs.writeFileSync(promptFile, prompt);
console.log(chalk.gray(`\n📄 Prompt also saved to: ${promptFile}`));

// Show instructions
console.log(chalk.cyan('\n' + '═'.repeat(70)));
console.log(chalk.cyan.bold('🚀 NEXT STEPS'));
console.log(chalk.cyan('═'.repeat(70)));

console.log(chalk.white('\n1. Open your OpenAI Codex interface'));
console.log(chalk.white('2. Paste the prompt (should be in clipboard)'));
console.log(chalk.white('3. Let Codex generate the artifacts'));
console.log(chalk.white('4. Codex should create files in /tmp/codex-artifacts/'));

console.log(chalk.yellow('\n📦 Expected Codex Output:'));
console.log('   - manifest-{timestamp}.json');
console.log('   - changes-{timestamp}.patch');
console.log('   - sbom-{timestamp}.cdx.json');
console.log('   - attestation-{timestamp}.intoto');

console.log(chalk.green('\n✨ After Codex completes, run:'));
console.log(chalk.white('   node scripts/monitor-codex-artifacts.js'));
console.log(chalk.gray('   (or manually: node scripts/process-codex-artifacts.js ' + PRD_ID + ')'));

// Option to display full prompt
console.log(chalk.gray('\n' + '─'.repeat(70)));
console.log(chalk.gray('Want to see the full prompt? Press Enter (or Ctrl+C to skip)'));

process.stdin.once('data', () => {
  console.log(chalk.white('\n' + '═'.repeat(70)));
  console.log(chalk.white('FULL PROMPT TO COPY:'));
  console.log(chalk.white('═'.repeat(70)));
  console.log(prompt);
  console.log(chalk.white('═'.repeat(70)));
  console.log(chalk.green('\n✨ Ready for OpenAI Codex!'));
  process.exit(0);
});

// Exit after 5 seconds if no input
setTimeout(() => {
  console.log(chalk.gray('\n(Skipped full display)'));
  console.log(chalk.green('✨ Prompt is in your clipboard!'));
  process.exit(0);
}, 5000);