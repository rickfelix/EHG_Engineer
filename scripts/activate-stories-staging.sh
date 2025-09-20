#!/bin/bash
# Staging Activation Script for User Stories
# Run this to progressively enable features in staging

set -e

echo "======================================"
echo "User Stories Staging Activation"
echo "======================================"

# Check environment
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Source your .env file first."
  exit 1
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Phase 1: Database Migration
echo -e "\n${YELLOW}Phase 1: Database Migration${NC}"
echo "Applying user stories migration..."

# We can't use psql directly, so use Supabase client
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  // Check if migration already applied
  const { data: cols } = await supabase.rpc('get_columns', {
    table_name: 'sd_backlog_map'
  }).catch(() => ({ data: [] }));

  if (cols?.some(c => c.column_name === 'item_type')) {
    console.log('✅ Migration already applied');
  } else {
    console.log('⚠️  Migration needs to be applied via Supabase SQL Editor');
    console.log('   Copy contents of: database/migrations/2025-01-17-user-stories.sql');
    console.log('   Go to: https://supabase.com/dashboard/project/dedlbzhpgkmetvhbkyzq/sql');
  }
})();
"

# Phase 2: Feature Flags Check
echo -e "\n${YELLOW}Phase 2: Feature Flags Configuration${NC}"
echo "Current feature flag settings:"

grep "FEATURE_.*STOR" .env | while read -r line; do
  key=$(echo "$line" | cut -d'=' -f1)
  value=$(echo "$line" | cut -d'=' -f2)
  if [ "$value" = "true" ]; then
    echo -e "  ${GREEN}✓ $key=$value${NC}"
  else
    echo -e "  ${RED}✗ $key=$value${NC}"
  fi
done

# Phase 3: Test Data Check
echo -e "\n${YELLOW}Phase 3: Test Data Verification${NC}"

node scripts/check-sd-with-filter.js --status active --limit 1 2>/dev/null | head -n 10 || {
  echo "⚠️  No active SDs found. Need to create test data."
}

# Phase 4: Story Generation Test (Dry Run)
echo -e "\n${YELLOW}Phase 4: Story Generation Test${NC}"

if grep -q "FEATURE_AUTO_STORIES=true" .env; then
  echo "Testing story generation (dry run)..."

  # Find a test SD with PRD
  SD_KEY="SD-TEST-001"
  PRD_ID="PRD-TEST-001"

  curl -s -X POST http://localhost:3000/api/stories/generate \
    -H "Content-Type: application/json" \
    -d "{\"sd_key\":\"$SD_KEY\",\"prd_id\":\"$PRD_ID\",\"mode\":\"dry_run\"}" \
    | jq '.' 2>/dev/null || echo "⚠️  API not running or feature disabled"
else
  echo "⚠️  FEATURE_AUTO_STORIES is not enabled"
fi

# Phase 5: UI Check
echo -e "\n${YELLOW}Phase 5: UI Verification${NC}"

if grep -q "VITE_FEATURE_STORY_UI=true" .env; then
  echo -e "${GREEN}✓ UI feature flag enabled${NC}"
  echo "  Remember to rebuild client: npm run build:client"
else
  echo -e "${RED}✗ UI feature flag disabled${NC}"
fi

# Phase 6: Smoke Test Checklist
echo -e "\n${YELLOW}Phase 6: Activation Checklist${NC}"
echo "Manual steps to complete:"
echo ""
echo "[ ] 1. Apply migration in Supabase SQL Editor"
echo "[ ] 2. Enable FEATURE_AUTO_STORIES=true in .env"
echo "[ ] 3. Enable VITE_FEATURE_STORY_UI=true in .env"
echo "[ ] 4. Rebuild client: npm run build:client"
echo "[ ] 5. Restart server: PORT=3000 node server.js"
echo "[ ] 6. Test story generation via API"
echo "[ ] 7. Navigate to /stories in browser"
echo "[ ] 8. Run Playwright test with story annotations"
echo "[ ] 9. Execute webhook mapper: node tools/post-playwright-results.mjs --dry-run"
echo "[ ] 10. Check release gates: node scripts/check-story-gates.js"
echo ""
echo "======================================"
echo "Ready for progressive activation!"
echo "======================================"