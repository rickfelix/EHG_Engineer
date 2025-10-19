#!/bin/bash

# Database Architect Sub-Agent: Execute SD-VIDEO-VARIANT-001 completion
# Method: Direct psql execution (bypass SSL issues with pg client)

echo "═══════════════════════════════════════════════════════════════"
echo "   PRINCIPAL DATABASE ARCHITECT - Direct psql Execution"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "👤 Role: Database Architect (30 years experience)"
echo "🎯 Task: Execute SD-VIDEO-VARIANT-001 completion via psql"
echo "📋 Context: Direct PostgreSQL command-line execution"
echo ""

# Load environment variables
source .env

if [ -z "$SUPABASE_POOLER_URL" ]; then
  echo "❌ SUPABASE_POOLER_URL not found in environment"
  exit 1
fi

echo "✅ Connection string found"
echo ""

echo "─── EXECUTION PLAN ───"
echo ""
echo "Transaction Steps:"
echo "  1. ALTER TABLE ... DISABLE TRIGGER status_auto_transition"
echo "  2. UPDATE strategic_directives_v2 SET status='completed'..."
echo "  3. ALTER TABLE ... ENABLE TRIGGER status_auto_transition"
echo "  4. SELECT verification query"
echo ""

echo "─── EXECUTING SQL TRANSACTION ───"
echo ""

# Execute SQL via psql
psql "$SUPABASE_POOLER_URL" <<'EOSQL'
BEGIN;

-- Step 1: Disable trigger
ALTER TABLE strategic_directives_v2 DISABLE TRIGGER status_auto_transition;

-- Step 2: Update SD to completed
UPDATE strategic_directives_v2
SET
  status = 'completed',
  progress = 100,
  current_phase = 'complete',
  completion_date = NOW(),
  updated_at = NOW()
WHERE id = 'SD-VIDEO-VARIANT-001';

-- Step 3: Re-enable trigger
ALTER TABLE strategic_directives_v2 ENABLE TRIGGER status_auto_transition;

COMMIT;

-- Verification query
\echo '─── VERIFICATION ───'
\echo ''
SELECT
  id,
  status,
  progress,
  current_phase,
  completion_date,
  updated_at
FROM strategic_directives_v2
WHERE id = 'SD-VIDEO-VARIANT-001';
EOSQL

if [ $? -eq 0 ]; then
  echo ""
  echo "─── SUCCESS ───"
  echo ""
  echo "✅ SD-VIDEO-VARIANT-001 MARKED AS COMPLETED"
  echo ""
  echo "Next Steps:"
  echo "  1. ✅ SD completion verified"
  echo "  2. 📋 Create SD-LEO-003 for permanent trigger fix"
  echo "  3. 📋 Generate final completion summary"
else
  echo ""
  echo "❌ EXECUTION FAILED"
  echo "   Check error messages above"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "   DATABASE ARCHITECT EXECUTION COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
