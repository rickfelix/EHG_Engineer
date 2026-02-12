#!/bin/bash
# Pre-commit hook: Block commits containing hardcoded secrets
# Installed by SD-LEO-ORCH-SECURITY-AUDIT-REMEDIATION-001-A
#
# Scans staged files for common secret patterns:
# - Supabase JWT tokens (full keys, not truncated examples)
# - API keys (OpenAI, Resend, Gemini, etc.)
# - Passwords in config
#
# To bypass (emergency only): git commit --no-verify

RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Patterns that indicate real secrets (not truncated examples ending in ...)
# Match full JWT tokens: header.payload.signature (each part is base64)
SECRET_PATTERNS=(
  # Full Supabase JWT tokens (header.payload.signature - all 3 parts present)
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}\.[A-Za-z0-9_-]{20,}'
  # OpenAI API keys
  'sk-proj-[A-Za-z0-9]{20,}'
  'sk-[A-Za-z0-9]{48}'
  # Generic API key patterns with real values
  'RESEND_API_KEY=re_[A-Za-z0-9]{20,}'
  'GEMINI_API_KEY=AI[A-Za-z0-9]{30,}'
)

# Files to exclude from scanning (test fixtures, examples)
EXCLUDE_PATTERNS=(
  'tests/'
  '.env.example'
  '.env.claude.example'
  '.env.project-template'
)

found_secrets=0

for pattern in "${SECRET_PATTERNS[@]}"; do
  # Check only staged files (about to be committed)
  matches=$(git diff --cached --diff-filter=ACM -G "$pattern" --name-only 2>/dev/null)

  if [ -n "$matches" ]; then
    for file in $matches; do
      # Skip excluded files
      skip=false
      for exclude in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$file" == *"$exclude"* ]]; then
          skip=true
          break
        fi
      done

      if [ "$skip" = true ]; then
        continue
      fi

      # Verify it's a real match (not truncated with ...)
      staged_content=$(git show ":$file" 2>/dev/null)
      if echo "$staged_content" | grep -qP "$pattern"; then
        echo -e "${RED}BLOCKED: Potential secret detected in: $file${NC}"
        echo -e "${YELLOW}  Pattern: $pattern${NC}"
        found_secrets=1
      fi
    done
  fi
done

if [ $found_secrets -ne 0 ]; then
  echo ""
  echo -e "${RED}Commit blocked: Hardcoded secrets detected in staged files.${NC}"
  echo ""
  echo "Actions:"
  echo "  1. Move secrets to .env file (loaded via dotenv)"
  echo "  2. Use \${ENV_VAR} placeholders in config files"
  echo "  3. For test fixtures, place in tests/ directory (excluded)"
  echo ""
  echo "Emergency bypass: git commit --no-verify"
  exit 1
fi

exit 0
