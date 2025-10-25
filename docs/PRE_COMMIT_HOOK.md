# Pre-Commit Hook Documentation

**Location:** `.husky/pre-commit`
**Purpose:** Automated quality checks before every git commit

## What It Does

The pre-commit hook runs three checks in sequence:

### 1. 🔍 ESLint Auto-Fix (NEW)

**Purpose:** Automatically fix simple linting issues in staged files

**Behavior:**
- Detects all staged `.js`, `.ts`, `.jsx`, `.tsx` files
- Runs `eslint --fix --quiet` on those files
- Auto-fixes simple issues:
  - Quote style (double → single)
  - Missing semicolons
  - Trailing whitespace
  - Other auto-fixable patterns
- Re-adds fixed files to staging
- **Does NOT fail the commit** - only fixes what it can

**Example:**
```bash
# Before commit:
const message = "hello world"  // Double quotes, missing semicolon

# After auto-fix (automatically applied):
const message = 'hello world';  // Single quotes, semicolon added
```

**Note:** The hook will show any remaining linting errors but will NOT block the commit. You can fix those manually later or in your next commit.

### 2. ✅ Smoke Tests

**Purpose:** Verify critical system functionality

**Behavior:**
- Runs `npm run test:smoke`
- Tests environment configuration, database connectivity, core dependencies
- **BLOCKS commit if tests fail**
- Typical run time: 6-8 seconds

**What to do if it fails:**
```bash
# Run tests manually to see details
npm run test:smoke

# Common fixes:
# - Check .env file has required values
# - Verify Supabase connection
# - Ensure dependencies are installed (npm install)
```

### 3. 📋 PRD Schema Validation

**Purpose:** Ensure PRD scripts follow the correct schema

**Behavior:**
- Detects changes to files matching: `scripts/(create-prd|add-prd|generate-prd|update-prd|insert-prd|populate-prd)*`
- Validates for deprecated field names:
  - `strategic_directive_id` → should be `sd_uuid`
  - `prd_id` → should be `id`
  - `user_stories` → should use separate table
  - `technical_architecture` → should be `system_architecture`
  - etc.
- **BLOCKS commit if validation fails**
- Provides fix suggestions in output

**What to do if it fails:**
```bash
# Auto-fix common issues
npm run prd:audit:fix <script-path>

# Or manually update the script based on error message
```

## Bypassing the Hook

**When to bypass:**
- Emergency hotfix
- Work-in-progress commit
- Hook malfunction

**How to bypass:**
```bash
git commit --no-verify -m "your message"
```

**⚠️ Warning:** Only use `--no-verify` when absolutely necessary. The hooks exist to maintain code quality.

## Hook Execution Order

```
1. ESLint Auto-Fix
   ↓ (runs silently, fixes what it can)
2. Smoke Tests
   ↓ (blocks on failure)
3. PRD Schema Validation
   ↓ (blocks on failure, only for PRD scripts)
4. Commit proceeds ✅
```

## Performance

- **ESLint Auto-Fix:** <1 second (only staged files)
- **Smoke Tests:** 6-8 seconds
- **PRD Validation:** <1 second (only when PRD scripts changed)

**Total typical time:** 7-10 seconds

## Troubleshooting

### Hook doesn't run at all
```bash
# Reinstall husky
npm install
npx husky install
```

### Hook runs but fails immediately
```bash
# Check hook file permissions
chmod +x .husky/pre-commit

# Check hook file syntax
cat .husky/pre-commit
```

### ESLint errors prevent commit
- **This shouldn't happen** - ESLint runs in non-blocking mode
- If it does, the hook may be misconfigured
- Use `--no-verify` and report the issue

### Smoke tests always fail
```bash
# Verify environment
npm run test:smoke

# Check .env file
cat .env

# Verify database connection
node scripts/verify-connection.js
```

## Customization

To modify hook behavior, edit `.husky/pre-commit`:

**Disable ESLint auto-fix:**
```bash
# Comment out lines 4-21 in .husky/pre-commit
```

**Add additional checks:**
```bash
# Add new checks after line 82, before final echo
```

**Change test timeouts:**
```bash
# Edit jest.config.cjs or test files
```

## Integration with CI/CD

The pre-commit hook is a **local development tool**. For CI/CD:
- Smoke tests also run in GitHub Actions
- Linting should be added to CI pipeline separately
- PRD validation runs in CI as well

## Related Documentation

- **Linting:** See `LINTING_SUMMARY.md`
- **Testing:** See `docs/testing/`
- **PRD Schema:** See `docs/PRD_SCRIPTS_AUDIT_SUMMARY.md`

---

*Last updated: 2025-10-25*
*Part of LEO Protocol v4.2.0 quality standards*
