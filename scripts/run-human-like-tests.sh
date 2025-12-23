#!/bin/bash

###############################################################################
# Human-Like E2E Test Runner
#
# Full workflow for running Human-Like E2E tests with:
# - Optional frontend restart (for when EHG changes were made)
# - All test categories (accessibility, chaos, visual, ux-evaluation)
# - Automatic retrospective generation
# - Metrics tracking for continuous improvement
#
# Usage:
#   ./scripts/run-human-like-tests.sh [OPTIONS]
#
# Options:
#   --restart-frontend    Restart EHG frontend before running tests
#   --category <cat>      Run only specific category (accessibility, chaos, visual, ux)
#   --stringency <level>  Set stringency (strict, standard, relaxed)
#   --skip-retro          Skip retrospective generation
#   --verbose             Show detailed test output
#   --help                Show this help message
#
# Examples:
#   ./scripts/run-human-like-tests.sh --restart-frontend
#   ./scripts/run-human-like-tests.sh --category accessibility --stringency strict
#   ./scripts/run-human-like-tests.sh --restart-frontend --verbose
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
RESTART_FRONTEND=false
CATEGORY=""
STRINGENCY="standard"
SKIP_RETRO=false
VERBOSE=false
BASE_URL="${BASE_URL:-http://localhost:8080}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --restart-frontend)
      RESTART_FRONTEND=true
      shift
      ;;
    --category)
      CATEGORY="$2"
      shift 2
      ;;
    --stringency)
      STRINGENCY="$2"
      shift 2
      ;;
    --skip-retro)
      SKIP_RETRO=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --help)
      head -30 "$0" | tail -28
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║           HUMAN-LIKE E2E TEST RUNNER                            ║"
echo "║           Continuous Improvement Through Testing                 ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Restart frontend if requested
if [ "$RESTART_FRONTEND" = true ]; then
  echo -e "${BLUE}🔄 Step 1: Restarting EHG frontend...${NC}"

  # Check if leo-stack.sh exists
  if [ -f "$SCRIPT_DIR/leo-stack.sh" ]; then
    # Stop just the EHG app
    echo "   Stopping EHG app..."
    pkill -f "vite.*EHG" 2>/dev/null || true
    sleep 2

    # Start it again using leo-stack
    echo "   Starting EHG app..."
    cd /mnt/c/_EHG/EHG && npm run dev > /tmp/ehg-dev.log 2>&1 &

    # Wait for it to be ready
    echo "   Waiting for EHG to be ready..."
    for i in {1..30}; do
      if curl -s "$BASE_URL" > /dev/null 2>&1; then
        echo -e "   ${GREEN}✅ EHG frontend is ready${NC}"
        break
      fi
      if [ $i -eq 30 ]; then
        echo -e "   ${RED}❌ EHG frontend failed to start${NC}"
        exit 1
      fi
      sleep 1
      echo -n "."
    done
    echo ""
  else
    echo -e "   ${YELLOW}⚠️  leo-stack.sh not found, skipping restart${NC}"
  fi
else
  echo -e "${BLUE}🔍 Step 1: Checking EHG frontend status...${NC}"
  if curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ EHG frontend is running at $BASE_URL${NC}"
  else
    echo -e "   ${RED}❌ EHG frontend is not running at $BASE_URL${NC}"
    echo -e "   ${YELLOW}   Use --restart-frontend to start it, or run: bash scripts/leo-stack.sh start${NC}"
    exit 1
  fi
fi

# Step 2: Run tests
echo -e "\n${BLUE}🧪 Step 2: Running Human-Like E2E tests...${NC}"
echo "   Stringency: $STRINGENCY"
echo "   Target URL: $BASE_URL"

cd "$PROJECT_ROOT"

# Build test command
TEST_CMD="npx playwright test"

if [ -n "$CATEGORY" ]; then
  case $CATEGORY in
    accessibility|a11y)
      TEST_CMD="$TEST_CMD tests/e2e/accessibility/"
      echo "   Category: accessibility"
      ;;
    chaos|resilience)
      TEST_CMD="$TEST_CMD tests/e2e/resilience/"
      echo "   Category: chaos/resilience"
      ;;
    visual)
      TEST_CMD="$TEST_CMD tests/e2e/visual/"
      echo "   Category: visual"
      ;;
    ux|ux-evaluation)
      TEST_CMD="$TEST_CMD tests/e2e/ux-evaluation/"
      echo "   Category: ux-evaluation"
      ;;
    *)
      echo -e "   ${YELLOW}Unknown category: $CATEGORY, running all tests${NC}"
      ;;
  esac
else
  # Run all Human-Like E2E test categories
  TEST_CMD="$TEST_CMD tests/e2e/accessibility/ tests/e2e/resilience/ tests/e2e/visual/ tests/e2e/ux-evaluation/"
  echo "   Category: ALL"
fi

TEST_CMD="$TEST_CMD --project=chromium"

# Set environment variables
export BASE_URL="$BASE_URL"
export E2E_STRINGENCY="$STRINGENCY"
export A11Y_STRINGENCY="$STRINGENCY"

# Run tests
echo -e "\n   Running: $TEST_CMD"
echo ""

START_TIME=$(date +%s)

if [ "$VERBOSE" = true ]; then
  $TEST_CMD --reporter=list || TEST_EXIT_CODE=$?
else
  $TEST_CMD --reporter=dot || TEST_EXIT_CODE=$?
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

if [ -z "$TEST_EXIT_CODE" ]; then
  TEST_EXIT_CODE=0
fi

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "\n   ${GREEN}✅ All tests passed in ${DURATION}s${NC}"
else
  echo -e "\n   ${YELLOW}⚠️  Some tests failed (exit code: $TEST_EXIT_CODE) - Duration: ${DURATION}s${NC}"
fi

# Step 3: Generate retrospective
if [ "$SKIP_RETRO" = false ]; then
  echo -e "\n${BLUE}📊 Step 3: Generating retrospective...${NC}"

  if [ -f "$PROJECT_ROOT/test-results/results.json" ]; then
    node "$SCRIPT_DIR/human-like-e2e-retrospective.js" || true
  else
    echo -e "   ${YELLOW}⚠️  No results.json found, skipping retrospective${NC}"
  fi
else
  echo -e "\n${BLUE}📊 Step 3: Skipping retrospective (--skip-retro)${NC}"
fi

# Summary
echo -e "\n${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                         SUMMARY                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo "   Duration: ${DURATION}s"
echo "   Stringency: $STRINGENCY"
echo "   Target: $BASE_URL"

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "   Result: ${GREEN}PASSED${NC}"
else
  echo -e "   Result: ${RED}FAILED${NC} (exit code: $TEST_EXIT_CODE)"
fi

echo ""
echo "   Reports:"
echo "   - HTML Report: npx playwright show-report"
echo "   - Results JSON: test-results/results.json"
echo "   - Evidence Pack: test-results/evidence-pack-manifest.json"
echo ""

exit $TEST_EXIT_CODE
