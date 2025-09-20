# Dual-Lane Branch Protection Configuration

## Overview
This document specifies the exact branch protection rules required for the dual-lane workflow to function correctly. These rules enforce the security and compliance gates at the repository level.

## Required Branch Protection Rules

### For `main` Branch

```yaml
protection_rules:
  require_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true
    require_code_owner_reviews: true

  require_status_checks:
    strict: true  # Require branches to be up to date before merging
    contexts:
      # LEO Protocol Gates (MANDATORY)
      - "LEO Gate Validation / Run Gate 3 for PRD-*"

      # Story Gates (MANDATORY if SD-linked)
      - "Story Release Gate Check / Check Story Release Gate"

      # Security Gates (MANDATORY)
      - "SLSA Verification / Verify SLSA Provenance"
      - "Policy Verification / Validate Policy Bundle"

      # Standard CI (RECOMMENDED)
      - "Run tests / test"
      - "Security Review / security-scan"

  require_conversation_resolution: true
  require_linear_history: false  # Allow merge commits for audit trail
  require_signed_commits: true
  include_administrators: false  # Admins must also follow rules
  restrict_dismissals: true
  allow_force_pushes: false
  allow_deletions: false
  block_creations: false
  lock_branch: false
```

### For `develop` Branch (if used)

```yaml
protection_rules:
  require_pull_request_reviews:
    required_approving_review_count: 1
    dismiss_stale_reviews: true

  require_status_checks:
    strict: true
    contexts:
      - "Run tests / test"
      - "SLSA Verification / Verify SLSA Provenance"
      - "Policy Verification / Validate Policy Bundle"

  require_signed_commits: true
  allow_force_pushes: false
  allow_deletions: false
```

## Critical Gate Requirements

### 1. LEO Gate Validation
**Check Name**: `LEO Gate Validation / Run Gate 3 for PRD-*`
- **Purpose**: Ensures PLAN Supervisor verification passes with ≥85% confidence
- **Blocking**: YES - PR cannot merge without PASS verdict
- **Retriggerable**: YES - Can be re-run if fixes are applied

### 2. Story Release Gate
**Check Name**: `Story Release Gate Check / Check Story Release Gate`
- **Purpose**: Validates story completion for SD-linked work
- **Blocking**: YES if PR is linked to an SD
- **Skippable**: Automatically skips for non-SD work

### 3. SLSA Provenance Verification
**Check Name**: `SLSA Verification / Verify SLSA Provenance`
- **Purpose**: Verifies all container images have valid SLSA L3 provenance
- **Blocking**: YES - No unsigned/unverified images allowed
- **Requirements**:
  - Images must use SHA256 digests (no mutable tags)
  - Must have valid in-toto attestations
  - Must be signed with cosign (keyless)

### 4. Policy Bundle Verification
**Check Name**: `Policy Verification / Validate Policy Bundle`
- **Purpose**: Ensures all policies are signed and valid
- **Blocking**: YES - Invalid policies cannot be deployed
- **Requirements**:
  - Kyverno policies must pass validation
  - OPA policies must be properly formatted
  - Bundle must be signed with cosign

## Label-Based Workflow States

The following labels are automatically managed by the auto-labels workflow:

| Label | Description | Branch Pattern | Trigger |
|-------|-------------|----------------|---------|
| `codex-building` | Codex generating diffs | `staging/codex-*` | PR opened/updated |
| `claude-enforcing` | Claude applying changes | `feature/*` | `[CODEX-READY]` found |
| `gates-passing` | CI/CD checks running | Any | Workflows triggered |
| `ready-to-merge` | All gates passed | Any | All checks green |

## Setting Up Branch Protection

### Via GitHub UI

1. Navigate to Settings → Branches
2. Add rule for `main` branch
3. Enable "Require a pull request before merging"
4. Enable "Require status checks to pass before merging"
5. Add each required check by exact name
6. Enable "Require branches to be up to date before merging"
7. Enable "Require conversation resolution"
8. Enable "Require signed commits"
9. Save changes

### Via GitHub API

```bash
# Script to configure branch protection via API
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["LEO Gate Validation / Run Gate 3 for PRD-*","Story Release Gate Check / Check Story Release Gate","SLSA Verification / Verify SLSA Provenance","Policy Verification / Validate Policy Bundle"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --field required_conversation_resolution=true \
  --field required_signatures=true
```

## Verification Script

```bash
#!/bin/bash
# verify-branch-protection.sh

echo "🔍 Verifying branch protection rules..."

# Check main branch protection
PROTECTION=$(gh api repos/:owner/:repo/branches/main/protection 2>/dev/null)

if [ -z "$PROTECTION" ]; then
  echo "❌ No branch protection on main branch"
  exit 1
fi

# Verify required checks
REQUIRED_CHECKS=(
  "LEO Gate Validation / Run Gate 3 for PRD-*"
  "Story Release Gate Check / Check Story Release Gate"
  "SLSA Verification / Verify SLSA Provenance"
  "Policy Verification / Validate Policy Bundle"
)

for check in "${REQUIRED_CHECKS[@]}"; do
  if echo "$PROTECTION" | jq -e ".required_status_checks.contexts[] | select(. == \"$check\")" > /dev/null; then
    echo "✅ Found required check: $check"
  else
    echo "❌ Missing required check: $check"
    exit 1
  fi
done

echo "✅ All branch protection rules verified"
```

## Troubleshooting

### Check Not Appearing
- Ensure workflow file is on default branch
- Verify job name matches exactly (case-sensitive)
- Check workflow has run at least once

### Check Always Failing
- Review workflow logs for specific errors
- Ensure required secrets are configured
- Verify artifact/image format compliance

### Labels Not Auto-Applying
- Check auto-labels workflow is enabled
- Verify PR branch matches expected pattern
- Ensure GitHub token has appropriate permissions

## Rollback Plan

If dual-lane workflow needs to be disabled:

1. Remove required status checks from branch protection
2. Disable auto-labels workflow
3. Manually remove dual-lane labels from open PRs
4. Document reason and timeline for re-enablement

## Audit Log

All changes to branch protection rules should be documented:

| Date | Change | Reason | Approved By |
|------|--------|--------|-------------|
| YYYY-MM-DD | Initial dual-lane setup | Security enhancement | Chairman |

---

*This configuration is part of the dual-lane supply chain security implementation under LEO Protocol v4.1.2*