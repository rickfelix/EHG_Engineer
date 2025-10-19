#!/bin/bash

echo "═══════════════════════════════════════════════════════════════"
echo "   PRINCIPAL DATABASE ARCHITECT - Automated Migration Execution"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "👤 Role: Database Architect (30 years experience)"
echo "🎯 Task: Execute progress_percentage column migration via psql"
echo "📋 Context: SD-VIDEO-VARIANT-001 LEAD→PLAN handoff unblock"
echo ""

# Load environment variables
source .env

echo "─── PHASE 1: AUTHENTICATION VERIFICATION ───"
echo ""
echo "🔐 Credentials Check:"
if [ -z "$SUPABASE_DB_PASSWORD" ]; then
  echo "   ❌ SUPABASE_DB_PASSWORD not found"
  echo "   Cannot proceed with automated execution"
  exit 1
else
  echo "   ✅ Database password found"
fi

if [ -z "$SUPABASE_POOLER_URL" ]; then
  echo "   ❌ SUPABASE_POOLER_URL not found"
  exit 1
else
  echo "   ✅ Pooler URL found"
fi
echo ""

echo "─── PHASE 2: PRE-MIGRATION VERIFICATION ───"
echo ""
echo "📊 Checking current schema state..."

export PGPASSWORD="$SUPABASE_DB_PASSWORD"

# Extract connection details
DB_HOST="aws-1-us-east-1.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.dedlbzhpgkmetvhbkyzq"

# Check if column exists
COLUMN_CHECK=$(psql "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" -t -c "
SELECT EXISTS (
  SELECT 1 
  FROM information_schema.columns 
  WHERE table_name = 'strategic_directives_v2' 
  AND column_name = 'progress_percentage'
);" 2>&1)

if echo "$COLUMN_CHECK" | grep -q "t"; then
  echo "✅ Column already exists (migration previously applied)"
  echo "   Skipping migration (idempotent)"
  echo ""
  exit 0
elif echo "$COLUMN_CHECK" | grep -q "f"; then
  echo "❌ Column missing (migration required)"
  echo ""
else
  echo "⚠️  Could not verify column state"
  echo "   Error: $COLUMN_CHECK"
  echo ""
  exit 1
fi

echo "─── PHASE 3: MIGRATION EXECUTION ───"
echo ""
echo "🚀 Executing migration SQL..."
echo ""

# Execute migration
psql "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" \
  -f database/migrations/add_progress_percentage_column.sql

MIGRATION_EXIT_CODE=$?

echo ""
if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
  echo "✅ MIGRATION EXECUTED SUCCESSFULLY"
  echo ""
  
  echo "─── PHASE 4: POST-MIGRATION VERIFICATION ───"
  echo ""
  echo "📊 Verifying column was added..."
  
  VERIFY_RESULT=$(psql "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" -t -c "
  SELECT column_name, data_type, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'strategic_directives_v2' 
  AND column_name = 'progress_percentage';
  ")
  
  if [ -n "$VERIFY_RESULT" ]; then
    echo "✅ Column verified:"
    echo "$VERIFY_RESULT"
    echo ""
    
    echo "📊 Checking SD-VIDEO-VARIANT-001..."
    psql "postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require" -c "
    SELECT id, title, progress_percentage 
    FROM strategic_directives_v2 
    WHERE id = 'SD-VIDEO-VARIANT-001';
    "
    echo ""
    
    echo "═══════════════════════════════════════════════════════════════"
    echo "   DATABASE ARCHITECT: MIGRATION COMPLETE ✅"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Run: node scripts/populate-sd-video-variant-fields.cjs"
    echo "   2. Run: node scripts/unified-handoff-system.js execute LEAD-to-PLAN SD-VIDEO-VARIANT-001"
    echo ""
    
  else
    echo "❌ Verification failed - column not found after migration"
    exit 1
  fi
  
else
  echo "❌ MIGRATION FAILED"
  echo "   Exit code: $MIGRATION_EXIT_CODE"
  echo ""
  exit 1
fi
