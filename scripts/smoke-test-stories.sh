#!/bin/bash
# Quick smoke test for User Stories feature
# Run this after enabling features to verify everything works

set -e

echo "======================================"
echo "User Stories Smoke Test Suite"
echo "======================================"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test results
PASSED=0
FAILED=0

# Helper function for tests
run_test() {
  local test_name="$1"
  local test_cmd="$2"

  echo -ne "Testing: $test_name... "

  if eval "$test_cmd" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ PASSED${NC}"
    ((PASSED++))
  else
    echo -e "${RED}✗ FAILED${NC}"
    ((FAILED++))
  fi
}

# 1. Check feature flags
echo -e "\n${YELLOW}1. Feature Flag Check${NC}"
run_test "AUTO_STORIES flag" "grep -q 'FEATURE_AUTO_STORIES=true' .env"
run_test "STORY_UI flag" "grep -q 'FEATURE_STORY_UI=true' .env"
run_test "STORY_AGENT flag" "grep -q 'FEATURE_STORY_AGENT=true' .env"
run_test "STORY_GATES flag" "grep -q 'FEATURE_STORY_GATES=true' .env"

# 2. Check database migration
echo -e "\n${YELLOW}2. Database Migration Check${NC}"
run_test "Story views exist" "node -e \"
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  supabase.from('v_story_verification_status').select('*', { count: 'exact', head: true })
    .then(r => process.exit(r.error ? 1 : 0));
\""

# 3. Check API endpoints
echo -e "\n${YELLOW}3. API Endpoint Check${NC}"

# Start server in background if not running
SERVER_PID=""
if ! curl -s http://localhost:3000/health >/dev/null 2>&1; then
  echo "Starting server for API tests..."
  PORT=3000 node server.js >/dev/null 2>&1 &
  SERVER_PID=$!
  sleep 5
fi

run_test "Stories API responds" "curl -s -f http://localhost:3000/api/stories?limit=1"

# 4. Test story generation (dry run)
echo -e "\n${YELLOW}4. Story Generation Test${NC}"

# Create test data
TEST_RESPONSE=$(curl -s -X POST http://localhost:3000/api/stories/generate \
  -H "Content-Type: application/json" \
  -d '{
    "sd_key": "SD-TEST-001",
    "prd_id": "550e8400-e29b-41d4-a716-446655440000",
    "mode": "dry_run"
  }' 2>/dev/null || echo "{}")

run_test "Story generation dry run" "echo '$TEST_RESPONSE' | jq -e '.status == \"success\" or .status == \"empty\"'"

# 5. Test Playwright mapper
echo -e "\n${YELLOW}5. Playwright Mapper Test${NC}"

# Create mock Playwright report
cat > /tmp/mock-playwright-report.json << 'EOF'
{
  "tests": [
    {
      "title": "Test with story",
      "outcome": "passed",
      "annotations": [
        { "type": "story", "description": "SD-TEST-001:US-12345678" }
      ]
    }
  ]
}
EOF

run_test "Mapper dry run" "node tools/post-playwright-results.mjs \
  --report /tmp/mock-playwright-report.json \
  --api http://localhost:3000/api/stories/verify \
  --token test-token \
  --dry-run"

# 6. Check UI routes
echo -e "\n${YELLOW}6. UI Route Check${NC}"

if [ -n "$SERVER_PID" ]; then
  run_test "Stories route accessible" "curl -s -f http://localhost:3000/stories -o /dev/null"
  run_test "Dashboard integration" "curl -s http://localhost:3000/api/stories?limit=1 | jq -e '.stories' >/dev/null"
fi

# 7. Check release gates
echo -e "\n${YELLOW}7. Release Gate Check${NC}"
run_test "Gate calculation script" "node scripts/check-story-gates.js >/dev/null 2>&1 || [ $? -eq 1 ]"

# 8. Check STORY sub-agent
echo -e "\n${YELLOW}8. Sub-Agent Check${NC}"
run_test "STORY agent exists" "test -f agents/story/index.js"
run_test "Sub-agent manifest" "test -f agents/story/manifest.json"
run_test "Event handler" "grep -q 'handlePRDCreated' agents/story/index.js"

# Cleanup
if [ -n "$SERVER_PID" ]; then
  echo -e "\nStopping test server..."
  kill $SERVER_PID 2>/dev/null || true
fi

rm -f /tmp/mock-playwright-report.json

# Summary
echo -e "\n${YELLOW}=====================================${NC}"
echo -e "${YELLOW}Test Summary${NC}"
echo -e "${YELLOW}=====================================${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✅ All smoke tests passed!${NC}"
  echo -e "${GREEN}User Stories feature is ready for use.${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed.${NC}"
  echo -e "${RED}Please check the configuration and try again.${NC}"
  exit 1
fi