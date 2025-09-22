#!/bin/bash
# Test Supabase database connectivity

echo "=== Testing Supabase Database Connectivity ==="
echo

# Load the pooler URL from environment
source .env

# Test 1: Basic connection
echo "1. Testing basic connection..."
psql "$SUPABASE_POOLER_URL" -c "SELECT version();" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "   ✅ Connection successful"
else
    echo "   ❌ Connection failed"
    exit 1
fi

# Test 2: Table access
echo "2. Testing table access..."
TABLES=$(psql "$SUPABASE_POOLER_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "   Found $TABLES public tables"

# Test 3: Backlog data
echo "3. Testing backlog data..."
SD_COUNT=$(psql "$SUPABASE_POOLER_URL" -t -c "SELECT COUNT(*) FROM strategic_directives_v2;")
BACKLOG_COUNT=$(psql "$SUPABASE_POOLER_URL" -t -c "SELECT COUNT(*) FROM sd_backlog_map;")
echo "   Strategic Directives: $SD_COUNT"
echo "   Backlog Items: $BACKLOG_COUNT"

# Test 4: Gap detection
echo "4. Testing gap detection..."
INVALID_PRIORITY=$(psql "$SUPABASE_POOLER_URL" -t -c "SELECT COUNT(*) FROM sd_backlog_map WHERE priority NOT IN ('High', 'Medium', 'Low');")
echo "   Items with invalid priority: $INVALID_PRIORITY"

echo
echo "=== All tests complete ===">