#!/bin/bash
# Database Architect: Apply Migration via Supabase CLI
# SD-EVA-CONTENT-001

echo "🗄️ DATABASE ARCHITECT: Applying Migration via Supabase CLI"
echo ""
echo "Target: EHG Database (liapbndqlqxdcgpwntbv)"
echo "Migration: 20251011_eva_content_catalogue_mvp.sql"
echo ""

# Get database password from environment
source .env

# Apply migration using Supabase CLI
echo "⚙️ Executing migration..."
echo ""

# Use psql via Supabase CLI connection
PGPASSWORD="${SUPABASE_DB_PASSWORD}" supabase db execute \
  --db-url "postgresql://postgres.liapbndqlqxdcgpwntbv:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
  --file database/migrations/20251011_eva_content_catalogue_mvp.sql

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration applied successfully!"
  echo ""
  echo "🔍 Verifying tables..."
  echo ""

  # Verify tables exist
  PGPASSWORD="${SUPABASE_DB_PASSWORD}" psql \
    "postgresql://postgres.liapbndqlqxdcgpwntbv:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
    -c "\dt content_*" \
    -c "\dt eva_*" \
    -c "\dt screen_*"

  echo ""
  echo "✅ DATABASE ARCHITECT: Migration Complete!"
else
  echo ""
  echo "❌ Migration failed!"
  exit 1
fi
