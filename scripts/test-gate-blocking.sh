#!/bin/bash
# Create a test PR to verify gate blocking
# This should fail if gates are working correctly

set -euo pipefail

BRANCH_NAME="test/gate-verification-$(date +%s)"
BASE_BRANCH="${1:-main}"

echo "🧪 Testing gate enforcement"
echo "Creating branch: $BRANCH_NAME"

# Create test branch
git checkout -b "$BRANCH_NAME"

# Make a trivial change
echo "# Gate Test $(date)" >> gate-test.md
git add gate-test.md
git commit -m "test: Verify gate blocks PRs with <80% passing stories"

# Push branch
git push origin "$BRANCH_NAME"

# Create PR
PR_URL=$(gh pr create \
  --title "TEST: Gate Enforcement Verification" \
  --body "This PR tests that the story gate blocks merging when <80% stories pass.

## Expected Result
- Gate check should FAIL
- PR should be BLOCKED from merging
- This proves automation is working

## SD Under Test
- SD-2025-PILOT-001 (or your test SD)
- Current passing: Check dashboard

This is a test PR and should be closed after verification." \
  --base "$BASE_BRANCH" \
  --head "$BRANCH_NAME" \
  --web)

echo "✅ Test PR created: $PR_URL"
echo ""
echo "Next steps:"
echo "1. Visit the PR URL"
echo "2. Wait for checks to run"
echo "3. Verify the gate check FAILS"
echo "4. Confirm merge is BLOCKED"
echo "5. Close the PR without merging"
echo ""
echo "To clean up:"
echo "  gh pr close --delete-branch"
echo "  git checkout $BASE_BRANCH"
echo "  git branch -D $BRANCH_NAME"