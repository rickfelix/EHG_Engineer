#!/bin/bash
# Story Verification Adapter
# Converts aggregate CI payload to individual story API calls
# Usage: bash scripts/verify-adapter.sh payload.json

set -euo pipefail

# Configuration
API="${STORY_VERIFY_API:-https://your-prod-domain.com/api/stories/verify}"
TOKEN="${SERVICE_TOKEN_PROD:?SERVICE_TOKEN_PROD not set}"
PAYLOAD_FILE="${1:?Usage: verify-adapter.sh payload.json}"

# Validate payload file exists
if [ ! -f "$PAYLOAD_FILE" ]; then
    echo "Error: Payload file not found: $PAYLOAD_FILE"
    exit 1
fi

# Extract build metadata
BUILD_ID=$(jq -r '.build_id // empty' "$PAYLOAD_FILE")
BRANCH=$(jq -r '.branch // "main"' "$PAYLOAD_FILE")
COMMIT=$(jq -r '.commit // empty' "$PAYLOAD_FILE")
TIMESTAMP=$(jq -r '.timestamp // empty' "$PAYLOAD_FILE")

if [ -z "$BUILD_ID" ]; then
    BUILD_ID="manual-$(date +%s)"
fi

echo "Processing stories for build: $BUILD_ID"
echo "API endpoint: $API"

# Track results
SUCCESS_COUNT=0
FAIL_COUNT=0

# Process each story
jq -c '.stories[]?' "$PAYLOAD_FILE" | while read -r story; do
    STORY_KEY=$(echo "$story" | jq -r '.story_key')
    STATUS=$(echo "$story" | jq -r '.status')
    COVERAGE=$(echo "$story" | jq -r '.coverage // .coverage_pct // empty')
    TEST_FILE=$(echo "$story" | jq -r '.test_file // empty')

    echo -n "Updating $STORY_KEY to $STATUS... "

    # Build request payload
    REQUEST_BODY=$(jq -n \
        --arg key "$STORY_KEY" \
        --arg status "$STATUS" \
        --arg build "$BUILD_ID" \
        --arg branch "$BRANCH" \
        --arg commit "$COMMIT" \
        --argjson coverage "${COVERAGE:-null}" \
        '{
            story_keys: [$key],
            status: $status,
            build_id: $build,
            branch: $branch,
            commit: $commit,
            coverage_pct: $coverage,
            test_run_id: ("tr-" + $build)
        }')

    # Send to API
    RESPONSE=$(curl -s -X POST "$API" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$REQUEST_BODY" \
        -w "\n%{http_code}")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
        echo "✓"
        ((SUCCESS_COUNT++))
    else
        echo "✗ (HTTP $HTTP_CODE)"
        echo "  Response: $BODY"
        ((FAIL_COUNT++))
    fi
done

echo ""
echo "Summary: $SUCCESS_COUNT successful, $FAIL_COUNT failed"

# Exit with error if any failed
if [ "$FAIL_COUNT" -gt 0 ]; then
    exit 1
fi