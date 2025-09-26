#!/bin/bash

# Vision Apply Smoke Test
# One-liner that validates, previews, and summarizes results

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Vision Apply Smoke Test${NC}"
echo "================================"
echo ""

# Step 1: Validate manifests
echo -e "${YELLOW}📋 Step 1: Validating manifests...${NC}"
if ! ./scripts/validate-vision-manifests.sh > /tmp/vision-validate.log 2>&1; then
    echo -e "${RED}❌ Manifest validation failed${NC}"
    tail -20 /tmp/vision-validate.log
    exit 1
fi
echo -e "${GREEN}✅ Manifests valid${NC}"

# Count items
SD_COUNT=$(tail -n +2 ops/inbox/vision_sd_manifest.csv 2>/dev/null | wc -l || echo 0)
PRD_COUNT=$(tail -n +2 ops/inbox/vision_prd_manifest.csv 2>/dev/null | wc -l || echo 0)
echo "   SDs to create: $SD_COUNT"
echo "   PRDs to create: $PRD_COUNT"
echo ""

# Step 2: Check configuration
echo -e "${YELLOW}📊 Step 2: Checking configuration...${NC}"
APPLY_GOV=$(gh variable get APPLY_VISION_GOV 2>/dev/null || echo "0")
PROD_WRITE=$(gh variable get PROD_WRITE_OK 2>/dev/null || echo "0")

if [ "$APPLY_GOV" != "1" ]; then
    echo -e "${YELLOW}⚠️  Setting APPLY_VISION_GOV=1${NC}"
    gh variable set APPLY_VISION_GOV -b "1"
fi

if [ "$PROD_WRITE" != "1" ]; then
    echo -e "${YELLOW}⚠️  PROD_WRITE_OK=0 (dry-run only)${NC}"
fi
echo ""

# Step 3: Run dry-run workflow
echo -e "${YELLOW}🔍 Step 3: Running dry-run preview...${NC}"
gh workflow run "Vision Governance Apply (Prod)" -f dry_run=true

# Wait for workflow to start
echo "⏳ Waiting for workflow to start..."
sleep 8

# Get run ID
RUN_ID=$(gh run list --workflow="Vision Governance Apply (Prod)" --limit 1 --json databaseId --jq '.[0].databaseId')

if [ -z "$RUN_ID" ]; then
    echo -e "${RED}❌ Could not find workflow run${NC}"
    exit 1
fi

echo "📊 Workflow run: $RUN_ID"
echo "   View at: $(gh run view $RUN_ID --json url --jq .url)"
echo ""

# Wait for completion with timeout
echo "⏳ Waiting for dry-run to complete (max 5 minutes)..."
WAIT_TIME=0
MAX_WAIT=300  # 5 minutes

while [ $WAIT_TIME -lt $MAX_WAIT ]; do
    STATUS=$(gh run view $RUN_ID --json status --jq .status)
    CONCLUSION=$(gh run view $RUN_ID --json conclusion --jq .conclusion)

    if [ "$STATUS" = "completed" ]; then
        if [ "$CONCLUSION" = "success" ]; then
            echo -e "${GREEN}✅ Dry-run completed successfully${NC}"
            break
        else
            echo -e "${RED}❌ Dry-run failed: $CONCLUSION${NC}"
            exit 1
        fi
    fi

    sleep 10
    WAIT_TIME=$((WAIT_TIME + 10))
    echo -n "."
done

if [ $WAIT_TIME -ge $MAX_WAIT ]; then
    echo -e "${RED}❌ Timeout waiting for workflow${NC}"
    exit 1
fi
echo ""

# Step 4: Download and analyze artifacts
echo -e "${YELLOW}📥 Step 4: Fetching results...${NC}"
ARTIFACT_DIR="/tmp/vision-artifacts-$$"
mkdir -p $ARTIFACT_DIR

# Try to download artifacts
if gh run download $RUN_ID -D $ARTIFACT_DIR 2>/dev/null; then
    echo -e "${GREEN}✅ Artifacts downloaded${NC}"

    # Look for results files
    if find $ARTIFACT_DIR -name "apply_results.txt" -o -name "new_records.csv" -o -name "manifest_validation.md" | head -1 > /dev/null; then
        echo ""
        echo -e "${GREEN}📊 SMOKE TEST RESULTS${NC}"
        echo "================================"

        # Show validation summary
        if [ -f "$ARTIFACT_DIR/*/manifest_validation.md" ]; then
            grep -E "SDs to create:|PRDs to create:|errors:|warnings:" $ARTIFACT_DIR/*/manifest_validation.md 2>/dev/null || true
        fi

        # Show apply results
        if [ -f "$ARTIFACT_DIR/*/apply_results.txt" ]; then
            echo ""
            echo "Apply Results:"
            grep -E "INSERT|UPDATE|SKIP|ERROR" $ARTIFACT_DIR/*/apply_results.txt | head -10 || true
        fi

        # Count new records
        if [ -f "$ARTIFACT_DIR/*/new_records.csv" ]; then
            NEW_SD_COUNT=$(tail -n +2 $ARTIFACT_DIR/*/new_records.csv 2>/dev/null | wc -l || echo 0)
            echo ""
            echo "Preview: $NEW_SD_COUNT SDs would be created"
        fi

        if [ -f "$ARTIFACT_DIR/*/new_prds.csv" ]; then
            NEW_PRD_COUNT=$(tail -n +2 $ARTIFACT_DIR/*/new_prds.csv 2>/dev/null | wc -l || echo 0)
            echo "Preview: $NEW_PRD_COUNT PRDs would be created"
        fi
    fi

    # Cleanup
    rm -rf $ARTIFACT_DIR
else
    echo -e "${YELLOW}⚠️  No artifacts available (normal for dry-run)${NC}"
fi

echo ""
echo "================================"
echo -e "${GREEN}✅ SMOKE TEST COMPLETE${NC}"
echo ""
echo "Next steps:"
echo "  1. Review workflow run: gh run view $RUN_ID"
if [ "$PROD_WRITE" != "1" ]; then
    echo "  2. Enable production writes: gh variable set PROD_WRITE_OK -b '1'"
fi
echo "  3. Apply to production:"
echo "     gh workflow run 'Vision Governance Apply (Prod)' -f dry_run=false -f confirm=PROMOTE"
echo ""

# Quick validation check
if [ $SD_COUNT -eq 0 ] && [ $PRD_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️  Warning: No items to create. Check your manifests.${NC}"
fi

# Success exit
exit 0