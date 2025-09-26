#!/bin/bash

# Vision Production Readiness Checker
# Validates all prerequisites before production apply

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Vision Production Readiness Check${NC}"
echo "======================================"
echo ""

READY=true

# 1. Check GitHub Secrets
echo -e "${YELLOW}1. Checking GitHub Secrets...${NC}"
SECRETS_OK=true

for secret in PGHOST_PROD PGPORT_PROD PGDATABASE_PROD PGUSER_PROD PGPASSWORD_PROD; do
    if gh secret list | grep -q "^$secret"; then
        echo -e "  ${GREEN}✅${NC} $secret is set"
    else
        echo -e "  ${RED}❌${NC} $secret is NOT set"
        SECRETS_OK=false
        READY=false
    fi
done

if [ "$SECRETS_OK" = false ]; then
    echo -e "${YELLOW}  ⚠️  Set missing secrets with: gh secret set SECRET_NAME -b 'value'${NC}"
fi
echo ""

# 2. Check GitHub Variables
echo -e "${YELLOW}2. Checking GitHub Variables...${NC}"

check_var() {
    local var=$1
    local required=$2
    local value=$(gh variable get $var 2>/dev/null || echo "not set")

    if [ "$value" = "not set" ]; then
        echo -e "  ${RED}❌${NC} $var: not set"
        if [ "$required" = "true" ]; then
            READY=false
        fi
        return 1
    elif [ "$value" = "1" ]; then
        echo -e "  ${GREEN}✅${NC} $var: enabled"
    else
        echo -e "  ${YELLOW}⚠️${NC} $var: $value (disabled)"
        if [ "$required" = "true" ]; then
            READY=false
        fi
    fi
}

check_var APPLY_VISION_GOV true
check_var PROD_WRITE_OK false  # Not required for dry-run
check_var APPLY_VISION_STORIES false  # Optional
echo ""

# 3. Check Manifests
echo -e "${YELLOW}3. Checking Manifest Files...${NC}"

if [ -f "ops/inbox/vision_sd_manifest.csv" ]; then
    SD_COUNT=$(tail -n +2 ops/inbox/vision_sd_manifest.csv | wc -l)
    echo -e "  ${GREEN}✅${NC} SD manifest: $SD_COUNT items"
else
    echo -e "  ${RED}❌${NC} SD manifest not found at ops/inbox/vision_sd_manifest.csv"
    READY=false
fi

if [ -f "ops/inbox/vision_prd_manifest.csv" ]; then
    PRD_COUNT=$(tail -n +2 ops/inbox/vision_prd_manifest.csv | wc -l)
    echo -e "  ${GREEN}✅${NC} PRD manifest: $PRD_COUNT items"
else
    echo -e "  ${RED}❌${NC} PRD manifest not found at ops/inbox/vision_prd_manifest.csv"
    READY=false
fi
echo ""

# 4. Validate Manifests
echo -e "${YELLOW}4. Validating Manifest Content...${NC}"

if [ -f "ops/inbox/vision_sd_manifest.csv" ] && [ -f "ops/inbox/vision_prd_manifest.csv" ]; then
    if ./scripts/validate-vision-manifests.sh > /tmp/vision-validate-check.log 2>&1; then
        echo -e "  ${GREEN}✅${NC} Manifests are valid"

        # Check for TODOs
        TODO_COUNT=$(grep -i "TODO\|TBD" ops/inbox/vision_*.csv 2>/dev/null | wc -l || echo 0)
        if [ $TODO_COUNT -gt 0 ]; then
            echo -e "  ${YELLOW}⚠️${NC} Found $TODO_COUNT TODO/TBD items - should be filled"
        fi
    else
        echo -e "  ${RED}❌${NC} Manifest validation failed"
        grep "ERROR" /tmp/vision-validate-check.log | head -5
        READY=false
    fi
else
    echo -e "  ${YELLOW}⚠️${NC} Cannot validate - manifests missing"
fi
echo ""

# 5. Check Database Connectivity (optional test)
echo -e "${YELLOW}5. Testing Database Connectivity...${NC}"

# Create a test query
cat > /tmp/test-connection.sql << 'EOF'
SELECT
    current_database() AS database,
    current_user AS user,
    version() AS version,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'strategic_directives_v2') AS sd_table_exists,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_requirements_v2') AS prd_table_exists;
EOF

# Try to connect (this will use workflow secrets, so may fail locally)
if command -v psql > /dev/null; then
    echo -e "  ${YELLOW}ℹ️${NC} Database test requires workflow context (will be checked during apply)"
else
    echo -e "  ${YELLOW}⚠️${NC} psql not installed - install with: sudo apt-get install postgresql-client"
fi
echo ""

# 6. Check Workflows
echo -e "${YELLOW}6. Checking Workflow Files...${NC}"

if [ -f ".github/workflows/vision-governance-apply-prod.yml" ]; then
    echo -e "  ${GREEN}✅${NC} Vision Governance Apply workflow exists"
else
    echo -e "  ${RED}❌${NC} Vision Governance Apply workflow not found"
    READY=false
fi

if [ -f "ops/jobs/vision_apply_governance_staging.sql" ]; then
    echo -e "  ${GREEN}✅${NC} Vision apply SQL job exists"
else
    echo -e "  ${RED}❌${NC} Vision apply SQL job not found"
    READY=false
fi
echo ""

# 7. Final Report
echo "======================================"
if [ "$READY" = true ]; then
    echo -e "${GREEN}✅ READY FOR PRODUCTION${NC}"
    echo ""
    echo "Quick start commands:"
    echo "  1. Smoke test (dry-run): ./scripts/vision-smoke-test.sh"
    echo "  2. Interactive apply: ./scripts/apply-vision-to-prod.sh"
    echo "  3. Direct workflow:"
    echo "     gh workflow run 'Vision Governance Apply (Prod)' -f dry_run=false -f confirm=PROMOTE"
else
    echo -e "${RED}❌ NOT READY FOR PRODUCTION${NC}"
    echo ""
    echo "Fix the issues above, then run this check again."
fi
echo ""

# Show summary
echo "Summary:"
echo "  • Secrets configured: $([[ "$SECRETS_OK" == "true" ]] && echo "Yes" || echo "No")"
echo "  • Manifests present: $([[ -f "ops/inbox/vision_sd_manifest.csv" ]] && echo "Yes" || echo "No")"
echo "  • Validation passes: $([[ "$READY" == "true" ]] && echo "Yes" || echo "No")"
echo "  • Items to create: ${SD_COUNT:-0} SDs, ${PRD_COUNT:-0} PRDs"

exit $([[ "$READY" == "true" ]] && echo 0 || echo 1)