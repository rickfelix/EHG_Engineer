#!/bin/bash

# Vision Data Production Apply Script
# Safely applies SDs/PRDs from manifests to production

set -e

echo "🎯 Vision Data Production Apply"
echo "================================"
echo ""

# Step 1: Validate manifests
echo "📋 Step 1: Validating manifests..."
./scripts/validate-vision-manifests.sh
if [ $? -ne 0 ]; then
    echo "❌ Manifest validation failed. Fix errors before proceeding."
    exit 1
fi

echo ""
echo "📊 Step 2: Configuration check..."

# Check GitHub variables
check_var() {
    local var_name=$1
    local value=$(gh variable get $var_name 2>/dev/null || echo "not set")
    if [ "$value" = "not set" ]; then
        echo "  ❌ $var_name: not set"
        return 1
    else
        echo "  ✅ $var_name: $value"
        return 0
    fi
}

all_vars_ok=true
check_var APPLY_VISION_GOV || all_vars_ok=false
check_var PROD_WRITE_OK || all_vars_ok=false

if [ "$all_vars_ok" = false ]; then
    echo ""
    echo "⚠️  Required variables not set. Run:"
    echo "  gh variable set APPLY_VISION_GOV -b '1'"
    echo "  gh variable set PROD_WRITE_OK -b '1'  # Only when ready for production"
    exit 1
fi

echo ""
echo "🔍 Step 3: Dry-run preview..."
echo "Running workflow in DRY-RUN mode to preview changes..."

# Run dry-run
gh workflow run "Vision Governance Apply (Prod)" -f dry_run=true

echo ""
echo "⏳ Waiting for workflow to start..."
sleep 5

# Get the run ID
RUN_ID=$(gh run list --workflow="Vision Governance Apply (Prod)" --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo "❌ Could not find workflow run"
    exit 1
fi

echo "📊 Workflow run: $RUN_ID"
echo "View at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$RUN_ID"
echo ""
echo "⏳ Waiting for dry-run to complete..."

# Wait for completion
gh run watch $RUN_ID --exit-status || {
    echo "❌ Dry-run failed. Check the workflow logs."
    exit 1
}

echo "✅ Dry-run completed successfully!"
echo ""

# Prompt for production apply
echo "════════════════════════════════════════"
echo "🚀 READY FOR PRODUCTION APPLY"
echo "════════════════════════════════════════"
echo ""
echo "The dry-run completed successfully."
echo "This will create the following in PRODUCTION:"
echo "  - Strategic Directives (SDs)"
echo "  - Product Requirements (PRDs)"
echo "  - Linkages between them"
echo ""
read -p "Type 'PROMOTE' to apply to production (or anything else to cancel): " confirm

if [ "$confirm" != "PROMOTE" ]; then
    echo "❌ Cancelled. No changes applied."
    exit 0
fi

echo ""
echo "🚀 Step 4: Production apply..."
echo "Running workflow in PRODUCTION mode..."

# Run production apply
gh workflow run "Vision Governance Apply (Prod)" -f dry_run=false -f confirm=PROMOTE

echo ""
echo "⏳ Waiting for workflow to start..."
sleep 5

# Get the new run ID
RUN_ID=$(gh run list --workflow="Vision Governance Apply (Prod)" --limit 1 --json databaseId --jq '.[0].databaseId')

echo "📊 Production workflow run: $RUN_ID"
echo "View at: https://github.com/$(gh repo view --json nameWithOwner -q .nameWithOwner)/actions/runs/$RUN_ID"
echo ""
echo "⏳ Waiting for production apply to complete..."

# Wait for completion
gh run watch $RUN_ID --exit-status || {
    echo "❌ Production apply failed. Check the workflow logs."
    echo "Rollback instructions available in the audit PR."
    exit 1
}

echo ""
echo "✅ Production apply completed successfully!"
echo ""
echo "📊 Next Steps:"
echo "  1. Review the audit PR created by the workflow"
echo "  2. Run Vision Alignment to verify improvements:"
echo "     gh workflow run 'Vision Alignment (Prod, Read-Only)'"
echo "  3. Run WSJF to see updated scores:"
echo "     gh workflow run 'WSJF Recommendations (Prod, Read-Only)'"
echo "  4. Apply stories if needed:"
echo "     gh workflow run 'Vision Stories Apply (Prod)' -f dry_run=false -f confirm=PROMOTE"
echo ""
echo "🎉 Vision data successfully populated to production!"