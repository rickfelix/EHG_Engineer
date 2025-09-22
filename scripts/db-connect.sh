#!/bin/bash
# Helper script to connect to Supabase via pooler (IPv4 compatible)

# Load connection string from environment
source .env

if [ -z "$SUPABASE_POOLER_URL" ]; then
    echo "Error: SUPABASE_POOLER_URL not set in .env file"
    echo "Please add: SUPABASE_POOLER_URL=postgresql://postgres.dedlbzhpgkmetvhbkyzq:[URL_ENCODED_PASSWORD]@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require"
    exit 1
fi

# If no arguments, open interactive psql session
if [ $# -eq 0 ]; then
    echo "Connecting to Supabase via pooler..."
    psql "$SUPABASE_POOLER_URL"
else
    # If arguments provided, execute as SQL command
    echo "Executing SQL command..."
    psql "$SUPABASE_POOLER_URL" "$@"
fi