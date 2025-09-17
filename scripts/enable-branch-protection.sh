#!/bin/bash
# Enable required gate check on protected branch
# Requires GitHub CLI and admin permissions

set -euo pipefail

# Configuration - UPDATE THESE
OWNER="${GITHUB_OWNER:-your-org}"
REPO="${GITHUB_REPO:-your-repo}"
BRANCH="${PROTECTED_BRANCH:-main}"

echo "🔒 Enabling gate protection for $OWNER/$REPO branch $BRANCH"

# Step 1: Get the latest commit SHA on the branch
echo "Getting latest commit on $BRANCH..."
SHA=$(gh api repos/$OWNER/$REPO/commits/$BRANCH --jq .sha)
echo "Latest commit: $SHA"

# Step 2: Find the gate check name
echo "Finding gate check name..."
CHECK_NAME=$(gh api repos/$OWNER/$REPO/commits/$SHA/check-runs \
  --jq '.check_runs[] | select(.name | contains("gate") or contains("Gate") or contains("story")) | .name' \
  | head -n1)

if [ -z "$CHECK_NAME" ]; then
    echo "❌ No gate check found. Available checks:"
    gh api repos/$OWNER/$REPO/commits/$SHA/check-runs --jq '.check_runs[].name'
    exit 1
fi

echo "Found gate check: $CHECK_NAME"

# Step 3: Update branch protection
echo "Updating branch protection..."
cat > branch-protection.json << EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$CHECK_NAME"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

# Apply protection
if gh api -X PUT repos/$OWNER/$REPO/branches/$BRANCH/protection \
   --input branch-protection.json; then
    echo "✅ Branch protection enabled with required check: $CHECK_NAME"
else
    echo "❌ Failed to update branch protection. You may need admin permissions."
    echo "Please share this configuration with an admin:"
    echo ""
    cat branch-protection.json
fi

# Cleanup
rm -f branch-protection.json

# Step 4: Verify protection
echo ""
echo "Verifying protection status..."
gh api repos/$OWNER/$REPO/branches/$BRANCH \
  --jq '.protection.required_status_checks.contexts[]' \
  | grep -q "$CHECK_NAME" && echo "✅ Gate check is required" || echo "❌ Gate check not found in requirements"

echo ""
echo "Current required checks:"
gh api repos/$OWNER/$REPO/branches/$BRANCH \
  --jq '.protection.required_status_checks.contexts[]' 2>/dev/null || echo "None"