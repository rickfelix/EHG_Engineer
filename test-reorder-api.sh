#!/bin/bash

echo "🧪 Testing SD Reorder API..."
echo

# Get initial state
echo "📊 Getting initial SD order (first 5)..."
curl -s http://localhost:3000/api/state | python3 -c "
import sys, json
data = json.load(sys.stdin)
sds = data['strategicDirectives'][:5]
for i, sd in enumerate(sds):
    print(f'{i+1}. {sd[\"title\"][:50]}... (ID: {sd[\"id\"][:12]}...)')
"

echo
echo "🎯 Testing reorder API on first SD..."

# Get the ID of the first SD
FIRST_SD_ID=$(curl -s http://localhost:3000/api/state | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['strategicDirectives'][0]['id'])
")

echo "Moving SD ${FIRST_SD_ID:0:12}... DOWN"

# Call reorder API
curl -X PATCH "http://localhost:3000/api/strategic-directives/${FIRST_SD_ID}/reorder" \
  -H "Content-Type: application/json" \
  -d '{"direction":"down"}' \
  -s | python3 -m json.tool | head -20

echo
echo "📊 Getting updated SD order (first 5)..."
curl -s http://localhost:3000/api/state | python3 -c "
import sys, json
data = json.load(sys.stdin)
sds = data['strategicDirectives'][:5]
for i, sd in enumerate(sds):
    print(f'{i+1}. {sd[\"title\"][:50]}... (ID: {sd[\"id\"][:12]}...)')
"

echo
echo "✅ Test complete! Check if the order changed above."