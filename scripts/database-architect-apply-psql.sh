#!/bin/bash
# Database Architect: Apply Migration via psql
# SD-EVA-CONTENT-001

echo "🗄️ DATABASE ARCHITECT: Applying Migration via psql"
echo ""
echo "Target: EHG Database (liapbndqlqxdcgpwntbv)"
echo "Migration: 20251011_eva_content_catalogue_mvp.sql"
echo ""

# Load environment
source .env

# Check if psql is available
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found. Please install PostgreSQL client."
  exit 1
fi

echo "⚙️ Executing migration..."
echo ""

# Apply migration using psql
PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
  "postgresql://postgres.liapbndqlqxdcgpwntbv:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  -f database/migrations/20251011_eva_content_catalogue_mvp.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration applied successfully!"
  echo ""
  echo "🔍 Verifying tables..."
  echo ""

  # Verify tables exist
  PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
    "postgresql://postgres.liapbndqlqxdcgpwntbv:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" \
    -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE 'content_%' OR table_name LIKE 'eva_%' OR table_name LIKE 'screen_%') ORDER BY table_name;"

  echo ""
  echo "✅ DATABASE ARCHITECT: Migration Complete!"
  echo "➡️ Next: Install dependencies and implement components"
else
  echo ""
  echo "❌ Migration failed!"
  exit 1
fi
