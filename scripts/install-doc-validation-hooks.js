#!/usr/bin/env node
/**
 * Install Documentation Validation Hooks
 * Sets up pre-commit hooks for documentation validation
 *
 * Creates hooks to run validation scripts before commits
 * that include .md file changes.
 *
 * Features:
 *   - Validates only STAGED .md files (not all docs)
 *   - Emergency bypass: DOCMON_BYPASS=1 git commit ...
 *   - Idempotent installation (preserves existing hooks)
 *   - Standardized DOCMON_ERROR output format
 *
 * Usage:
 *   node scripts/install-doc-validation-hooks.js          # Install hooks
 *   node scripts/install-doc-validation-hooks.js --check  # Check if installed
 *   node scripts/install-doc-validation-hooks.js --remove # Remove hooks
 *
 * Bypass (emergencies only):
 *   DOCMON_BYPASS=1 git commit -m "emergency: ..."
 *
 * Part of SD-LEO-INFRA-DOCMON-SUB-AGENT-001-D
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const HUSKY_DIR = path.join(ROOT_DIR, '.husky');

// Hook file configuration
const DOC_HOOK_MARKER = '# DOC-VALIDATION-HOOK';
const HOOK_VERSION = '2.0.0'; // Track hook version for updates
const HOOK_CONTENT = `
${DOC_HOOK_MARKER}
# DOCMON Pre-Commit Validation Hook v${HOOK_VERSION}
# Validates only STAGED .md files before commit
# Bypass: DOCMON_BYPASS=1 git commit -m "emergency: ..."

# Emergency bypass mechanism
if [ "\${DOCMON_BYPASS:-0}" = "1" ]; then
  echo "⚠️  DOCMON_BYPASS=1 detected - skipping documentation validation"
  echo "   WARNING: This bypass should only be used for emergencies!"
  echo "   Please run 'npm run docs:validate' before pushing."
  # Log bypass for audit trail
  echo "[$(date -Iseconds)] DOCMON bypass used for commit" >> .docmon-bypass.log 2>/dev/null || true
else
  # Check if any .md files are being committed (staged)
  md_files=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.md$' || true)

  if [ -n "$md_files" ]; then
    start_time=$(date +%s%3N 2>/dev/null || date +%s)
    file_count=$(echo "$md_files" | wc -l | tr -d ' ')
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  DOCMON PRE-COMMIT VALIDATION"
    echo "════════════════════════════════════════════════════════════"
    echo "  Staged files: $file_count .md file(s)"
    echo ""

    validation_errors=0
    validation_warnings=0

    # Run location validation on staged files only
    echo "  [1/3] Location validation..."
    if ! npm run docs:validate:staged -- --validator=location 2>/dev/null; then
      echo "  DOCMON_ERROR: LOCATION_VALIDATION_FAILED"
      echo "    Run 'npm run docs:validate-location' for details"
      validation_errors=$((validation_errors + 1))
    else
      echo "        ✓ Location check passed"
    fi

    # Run metadata validation (warning only, not blocking)
    echo "  [2/3] Metadata validation..."
    if ! npm run docs:validate:staged -- --validator=metadata 2>/dev/null; then
      echo "        ⚠ Metadata warnings (non-blocking)"
      validation_warnings=$((validation_warnings + 1))
    else
      echo "        ✓ Metadata check passed"
    fi

    # Run naming validation
    echo "  [3/3] Naming validation..."
    if ! npm run docs:validate:staged -- --validator=naming 2>/dev/null; then
      echo "  DOCMON_ERROR: NAMING_VALIDATION_FAILED"
      echo "    Run 'npm run docs:validate-naming' for details"
      validation_errors=$((validation_errors + 1))
    else
      echo "        ✓ Naming check passed"
    fi

    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    elapsed=$((end_time - start_time))

    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "  Summary: $file_count files | $validation_errors errors | $validation_warnings warnings | \${elapsed}ms"

    if [ "$validation_errors" -gt 0 ]; then
      echo ""
      echo "  ❌ RESULT: BLOCKED"
      echo "     Fix validation errors or use DOCMON_BYPASS=1 for emergencies"
      echo "════════════════════════════════════════════════════════════"
      echo ""
      exit 1
    else
      echo ""
      echo "  ✅ RESULT: PASS"
      echo "════════════════════════════════════════════════════════════"
      echo ""
    fi
  fi
fi
# END-DOC-VALIDATION-HOOK
`;

function checkHuskyExists() {
  if (!fs.existsSync(HUSKY_DIR)) {
    console.log('❌ Husky directory not found at .husky/');
    console.log('   Run "npx husky install" first to set up husky.');
    return false;
  }
  return true;
}

function getPreCommitPath() {
  return path.join(HUSKY_DIR, 'pre-commit');
}

function isHookInstalled() {
  const preCommitPath = getPreCommitPath();
  if (!fs.existsSync(preCommitPath)) {
    return false;
  }
  const content = fs.readFileSync(preCommitPath, 'utf8');
  return content.includes(DOC_HOOK_MARKER);
}

function installHook() {
  if (!checkHuskyExists()) {
    process.exit(1);
  }

  const preCommitPath = getPreCommitPath();

  // Check if pre-commit exists
  if (fs.existsSync(preCommitPath)) {
    // Check if already installed
    if (isHookInstalled()) {
      console.log('✅ Documentation validation hook is already installed.');
      return;
    }

    // Append to existing pre-commit
    console.log('📝 Appending documentation validation to existing pre-commit hook...');
    const existingContent = fs.readFileSync(preCommitPath, 'utf8');
    fs.writeFileSync(preCommitPath, existingContent + '\n' + HOOK_CONTENT, 'utf8');
  } else {
    // Create new pre-commit hook
    console.log('📝 Creating pre-commit hook with documentation validation...');
    const fullContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"
${HOOK_CONTENT}`;
    fs.writeFileSync(preCommitPath, fullContent, 'utf8');
    // Make executable on Unix systems
    try {
      fs.chmodSync(preCommitPath, '755');
    } catch (_e) {
      // Ignore on Windows
    }
  }

  console.log('✅ Documentation validation hook installed successfully!');
  console.log(`   Version: ${HOOK_VERSION}`);
  console.log('');
  console.log('The hook validates STAGED .md files on commit:');
  console.log('  • Location validation (blocking)');
  console.log('  • Metadata validation (warning only)');
  console.log('  • Naming validation (blocking)');
  console.log('');
  console.log('Emergency bypass (use sparingly):');
  console.log('  DOCMON_BYPASS=1 git commit -m "emergency: message"');
}

function removeHook() {
  const preCommitPath = getPreCommitPath();

  if (!fs.existsSync(preCommitPath)) {
    console.log('ℹ️  No pre-commit hook found. Nothing to remove.');
    return;
  }

  if (!isHookInstalled()) {
    console.log('ℹ️  Documentation validation hook is not installed. Nothing to remove.');
    return;
  }

  const content = fs.readFileSync(preCommitPath, 'utf8');

  // Remove the doc validation section
  const startMarker = `\n${DOC_HOOK_MARKER}`;
  const endMarker = '# END-DOC-VALIDATION-HOOK\n';
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.log('⚠️  Could not locate hook boundaries. Manual removal may be needed.');
    return;
  }

  const newContent = content.substring(0, startIndex) + content.substring(endIndex + endMarker.length);

  // Check if anything meaningful is left
  const remainingContent = newContent.replace(/#!.*\n/, '').replace(/\. .*husky\.sh.*\n/, '').trim();

  if (!remainingContent) {
    // Nothing else in the hook, remove the file
    fs.unlinkSync(preCommitPath);
    console.log('✅ Pre-commit hook removed (no other hooks were present).');
  } else {
    // Keep other hooks
    fs.writeFileSync(preCommitPath, newContent, 'utf8');
    console.log('✅ Documentation validation hook removed. Other hooks preserved.');
  }
}

function checkStatus() {
  if (!checkHuskyExists()) {
    process.exit(1);
  }

  if (isHookInstalled()) {
    console.log('✅ Documentation validation hook is INSTALLED');
    console.log(`   Version: ${HOOK_VERSION}`);
    console.log('');
    console.log('Validations run on STAGED .md files:');
    console.log('  • Location validation (blocking)');
    console.log('  • Metadata validation (warning only)');
    console.log('  • Naming validation (blocking)');
    console.log('');
    console.log('Emergency bypass:');
    console.log('  DOCMON_BYPASS=1 git commit -m "emergency: message"');
    process.exit(0);
  } else {
    console.log('❌ Documentation validation hook is NOT INSTALLED');
    console.log('');
    console.log('Run this script without arguments to install:');
    console.log('  node scripts/install-doc-validation-hooks.js');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);

  console.log('📋 Documentation Validation Hook Manager');
  console.log('='.repeat(50));
  console.log('');

  if (args.includes('--check')) {
    checkStatus();
  } else if (args.includes('--remove')) {
    removeHook();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  node scripts/install-doc-validation-hooks.js          Install hooks');
    console.log('  node scripts/install-doc-validation-hooks.js --check  Check status');
    console.log('  node scripts/install-doc-validation-hooks.js --remove Remove hooks');
  } else {
    installHook();
  }
}

main();
