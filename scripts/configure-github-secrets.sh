#!/bin/bash
# GitHub Repository Secrets Configuration Script
# Generated: 2025-10-26
# Purpose: Automate configuration of missing GitHub repository secrets

set -e  # Exit on error

echo "=========================================="
echo "GitHub Secrets Configuration Wizard"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}ERROR: GitHub CLI (gh) is not installed${NC}"
    echo "Install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}ERROR: Not authenticated with GitHub CLI${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓${NC} GitHub CLI authenticated"
echo ""

# Function to check if secret exists
check_secret() {
    local secret_name=$1
    if gh secret list --json name | jq -r '.[].name' | grep -q "^${secret_name}$"; then
        return 0  # exists
    else
        return 1  # does not exist
    fi
}

# Function to check if variable exists
check_variable() {
    local var_name=$1
    if gh variable list 2>/dev/null | grep -q "^${var_name}"; then
        return 0  # exists
    else
        return 1  # does not exist
    fi
}

echo "=========================================="
echo "PHASE 1: CRITICAL SECRETS"
echo "=========================================="
echo ""

# SUPABASE_SERVICE_ROLE_KEY
echo "1. Checking SUPABASE_SERVICE_ROLE_KEY..."
if check_secret "SUPABASE_SERVICE_ROLE_KEY"; then
    echo -e "${GREEN}✓${NC} SUPABASE_SERVICE_ROLE_KEY already configured"
else
    echo -e "${YELLOW}⚠${NC} SUPABASE_SERVICE_ROLE_KEY is MISSING"
    echo ""
    echo "To get this key:"
    echo "  1. Visit: https://app.supabase.com/project/dedlbzhpgkmetvhbkyzq/settings/api"
    echo "  2. Copy the 'service_role' key (starts with eyJhbGci...)"
    echo ""
    read -p "Do you have the SUPABASE_SERVICE_ROLE_KEY? (y/n): " has_key

    if [ "$has_key" = "y" ]; then
        echo "Paste the service role key below (input will be hidden):"
        gh secret set SUPABASE_SERVICE_ROLE_KEY
        echo -e "${GREEN}✓${NC} SUPABASE_SERVICE_ROLE_KEY configured"
    else
        echo -e "${RED}✗${NC} Skipping SUPABASE_SERVICE_ROLE_KEY (CRITICAL - configure manually)"
    fi
fi
echo ""

# DATABASE_URL (should already exist, but verify)
echo "2. Checking DATABASE_URL..."
if check_secret "DATABASE_URL"; then
    echo -e "${GREEN}✓${NC} DATABASE_URL already configured"
else
    echo -e "${RED}✗${NC} DATABASE_URL is MISSING (CRITICAL)"
    echo ""
    echo "DATABASE_URL should be the Supabase pooler URL:"
    echo "  postgresql://postgres.dedlbzhpgkmetvhbkyzq:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
    echo ""
    read -p "Do you want to configure it now? (y/n): " configure_db

    if [ "$configure_db" = "y" ]; then
        echo "Paste the DATABASE_URL below (input will be hidden):"
        gh secret set DATABASE_URL
        echo -e "${GREEN}✓${NC} DATABASE_URL configured"
    else
        echo -e "${RED}✗${NC} Skipping DATABASE_URL (configure manually)"
    fi
fi
echo ""

echo "=========================================="
echo "PHASE 2: REPOSITORY VARIABLES"
echo "=========================================="
echo ""

# SUPABASE_URL variable
echo "3. Checking SUPABASE_URL variable..."
if check_variable "SUPABASE_URL"; then
    echo -e "${GREEN}✓${NC} SUPABASE_URL variable already configured"
else
    echo -e "${YELLOW}⚠${NC} SUPABASE_URL variable is MISSING"
    echo "Setting to: https://dedlbzhpgkmetvhbkyzq.supabase.co"
    gh variable set SUPABASE_URL --body "https://dedlbzhpgkmetvhbkyzq.supabase.co"
    echo -e "${GREEN}✓${NC} SUPABASE_URL variable configured"
fi
echo ""

# BASE_URL variable
echo "4. Checking BASE_URL variable..."
if check_variable "BASE_URL"; then
    echo -e "${GREEN}✓${NC} BASE_URL variable already configured"
else
    echo -e "${YELLOW}⚠${NC} BASE_URL variable is MISSING"
    echo ""
    echo "BASE_URL should be your application URL (e.g., http://localhost:3000 or https://staging.example.com)"
    read -p "Enter BASE_URL [http://localhost:3000]: " base_url
    base_url=${base_url:-http://localhost:3000}
    gh variable set BASE_URL --body "$base_url"
    echo -e "${GREEN}✓${NC} BASE_URL variable configured: $base_url"
fi
echo ""

echo "=========================================="
echo "PHASE 3: OPTIONAL SECRETS"
echo "=========================================="
echo ""

# GH_PAT
echo "5. Checking GH_PAT (Personal Access Token)..."
if check_secret "GH_PAT"; then
    echo -e "${GREEN}✓${NC} GH_PAT already configured"
else
    echo -e "${YELLOW}⚠${NC} GH_PAT is MISSING (needed for UAT testing)"
    echo ""
    echo "To create a Personal Access Token:"
    echo "  1. Visit: https://github.com/settings/tokens"
    echo "  2. Generate new token (classic)"
    echo "  3. Select scope: 'repo' (Full control of private repositories)"
    echo "  4. Note: 'CI/CD UAT Testing - rickfelix/ehg access'"
    echo "  5. Generate and copy the token"
    echo ""
    read -p "Do you have a GH_PAT ready? (y/n): " has_pat

    if [ "$has_pat" = "y" ]; then
        echo "Paste the Personal Access Token below (input will be hidden):"
        gh secret set GH_PAT
        echo -e "${GREEN}✓${NC} GH_PAT configured"
        echo ""
        echo -e "${YELLOW}NOTE:${NC} You must also:"
        echo "  1. Edit .github/workflows/uat-testing.yml"
        echo "  2. Uncomment lines 27-35 (EHG checkout step)"
        echo "  3. Remove 'if: false' from line 17"
    else
        echo -e "${YELLOW}⚠${NC} Skipping GH_PAT (UAT testing will remain disabled)"
    fi
fi
echo ""

# SERVICE_TOKEN_STAGING (optional - can use SUPABASE_SERVICE_ROLE_KEY fallback)
echo "6. Checking SERVICE_TOKEN_STAGING..."
if check_secret "SERVICE_TOKEN_STAGING"; then
    echo -e "${GREEN}✓${NC} SERVICE_TOKEN_STAGING already configured"
else
    echo -e "${YELLOW}⚠${NC} SERVICE_TOKEN_STAGING is not configured"
    echo "This is optional - workflows will fall back to SUPABASE_SERVICE_ROLE_KEY"
    read -p "Do you want to configure a separate SERVICE_TOKEN_STAGING? (y/n): " configure_staging

    if [ "$configure_staging" = "y" ]; then
        echo "Paste the SERVICE_TOKEN_STAGING below (input will be hidden):"
        gh secret set SERVICE_TOKEN_STAGING
        echo -e "${GREEN}✓${NC} SERVICE_TOKEN_STAGING configured"
    else
        echo -e "${GREEN}✓${NC} Using SUPABASE_SERVICE_ROLE_KEY fallback (recommended)"
    fi
fi
echo ""

# ENABLE_VH_CHECKS variable
echo "7. Checking ENABLE_VH_CHECKS variable..."
if check_variable "ENABLE_VH_CHECKS"; then
    echo -e "${GREEN}✓${NC} ENABLE_VH_CHECKS variable already configured"
else
    echo -e "${YELLOW}⚠${NC} ENABLE_VH_CHECKS variable is MISSING (needed for VH ideation workflow)"
    read -p "Enable VH ideation checks? (y/n): " enable_vh

    if [ "$enable_vh" = "y" ]; then
        gh variable set ENABLE_VH_CHECKS --body "1"
        echo -e "${GREEN}✓${NC} ENABLE_VH_CHECKS variable configured"
        echo -e "${YELLOW}NOTE:${NC} You must also:"
        echo "  1. Edit .github/workflows/vh-ideation-staging-readonly.yml"
        echo "  2. Remove 'if: false' from line 22"
        echo "  3. Restore original condition on line 23"
    else
        echo -e "${YELLOW}⚠${NC} Skipping ENABLE_VH_CHECKS (VH ideation workflow will remain disabled)"
    fi
fi
echo ""

echo "=========================================="
echo "CONFIGURATION SUMMARY"
echo "=========================================="
echo ""

echo "Current Secrets:"
gh secret list
echo ""

echo "Current Variables:"
gh variable list
echo ""

echo "=========================================="
echo "NEXT STEPS"
echo "=========================================="
echo ""

echo "1. Validate Configuration:"
echo "   gh run list --limit 5"
echo ""

echo "2. Test Workflows:"
echo "   git commit --allow-empty -m 'test: Validate CI/CD secrets configuration'"
echo "   git push"
echo ""

echo "3. Monitor Results:"
echo "   gh run watch"
echo ""

echo "4. Review Documentation:"
echo "   cat docs/ci-cd-secrets-audit-report.md"
echo ""

echo -e "${GREEN}✓${NC} Configuration wizard complete!"
echo ""
