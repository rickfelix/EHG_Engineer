#!/usr/bin/env node
/**
 * Cross-platform git hook installer
 * Installs pre-commit secret scanning hook
 *
 * Usage: node scripts/hooks/install-hooks.js
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

// Find git hooks directory
const gitDir = join(projectRoot, '.git');
const hooksDir = existsSync(gitDir) && !existsSync(join(gitDir, 'hooks'))
  ? (mkdirSync(join(gitDir, 'hooks'), { recursive: true }), join(gitDir, 'hooks'))
  : join(gitDir, 'hooks');

// If .git is a file (worktree), read the actual git dir
let actualHooksDir = hooksDir;
if (!existsSync(hooksDir)) {
  const fs = await import('fs');
  const gitContent = fs.readFileSync(gitDir, 'utf8').trim();
  if (gitContent.startsWith('gitdir:')) {
    const actualGitDir = gitContent.replace('gitdir:', '').trim();
    actualHooksDir = join(projectRoot, actualGitDir, 'hooks');
    if (!existsSync(actualHooksDir)) {
      mkdirSync(actualHooksDir, { recursive: true });
    }
  }
}

// Pre-commit hook content (Node.js for cross-platform)
const hookContent = `#!/usr/bin/env node
/**
 * Pre-commit hook: Block commits containing hardcoded secrets
 * Installed by: scripts/hooks/install-hooks.js
 */
import { execSync } from 'child_process';

const SECRET_PATTERNS = [
  // Full Supabase JWT tokens (header.payload.signature)
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.[A-Za-z0-9_-]{50,}\\.[A-Za-z0-9_-]{20,}/,
  // OpenAI API keys
  /sk-proj-[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9]{48}/,
  // Specific provider keys with values
  /RESEND_API_KEY=re_[A-Za-z0-9]{20,}/,
  /GEMINI_API_KEY=AI[A-Za-z0-9]{30,}/,
];

const EXCLUDED_PATHS = ['tests/', '.env.example', '.env.claude.example', '.env.project-template'];

try {
  // Get staged file names
  const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
    .trim()
    .split('\\n')
    .filter(Boolean);

  let found = false;

  for (const file of stagedFiles) {
    if (EXCLUDED_PATHS.some(p => file.includes(p))) continue;

    try {
      const content = execSync(\`git show ":\${file}"\`, { encoding: 'utf8' });

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          console.error(\`\\x1b[31mBLOCKED: Secret detected in \${file}\\x1b[0m\`);
          found = true;
          break;
        }
      }
    } catch {
      // Binary file or deleted - skip
    }
  }

  if (found) {
    console.error('\\nCommit blocked: Move secrets to .env (loaded via dotenv)');
    console.error('Emergency bypass: git commit --no-verify');
    process.exit(1);
  }
} catch (err) {
  // If hook fails, don't block the commit
  console.warn('Secret scan hook warning:', err.message);
}
`;

const hookPath = join(actualHooksDir, 'pre-commit');

writeFileSync(hookPath, hookContent, { mode: 0o755 });

try {
  chmodSync(hookPath, 0o755);
} catch {
  // Windows doesn't support chmod, but that's OK
}

console.log('✅ Pre-commit secret scanning hook installed');
console.log(`   Path: ${hookPath}`);
console.log('   Scans for: JWT tokens, OpenAI keys, provider API keys');
console.log('   Excludes: tests/, .env.example, .env.claude.example');
