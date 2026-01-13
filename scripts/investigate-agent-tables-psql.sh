#!/bin/bash
# Investigation script for EHG agent tables
# READ-ONLY queries to check database state

echo "════════════════════════════════════════════════════════════════"
echo "🔍 EHG APPLICATION AGENT INVESTIGATION"
echo "   Database: liapbndqlqxdcgpwntbv (EHG business app)"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd ../ehg

# Get database URL from environment
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep SUPABASE | xargs)
fi

# Construct pooler URL if not set
if [ -z "$DATABASE_URL" ]; then
  echo "⚠️  DATABASE_URL not set, attempting to use SUPABASE credentials..."

  # Try to get from .env file
  SUPABASE_URL=$(grep VITE_SUPABASE_URL .env | cut -d '"' -f 2)
  PROJECT_ID=$(echo $SUPABASE_URL | sed 's/https:\/\///' | cut -d '.' -f 1)

  echo "   Project ID: $PROJECT_ID"
  echo ""
fi

echo "1️⃣  AI_CEO_AGENTS TABLE"
echo "   ─────────────────────────────────────────────────────────────"

# Check if we can use psql
if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    echo "   Using psql to query database..."
    echo ""

    # Query ai_ceo_agents
    echo "   SELECT COUNT(*) FROM ai_ceo_agents:"
    psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM ai_ceo_agents;" 2>&1 | head -5

    echo ""
    echo "   Sample records:"
    psql "$DATABASE_URL" -c "SELECT agent_id, agent_name, is_active, created_at FROM ai_ceo_agents LIMIT 5;" 2>&1 | head -10
else
    echo "   ⚠️  psql not available or DATABASE_URL not set"
    echo "   Will use Supabase JS client instead"
fi

echo ""
echo "2️⃣  AGENT_DEPARTMENTS TABLE"
echo "   ─────────────────────────────────────────────────────────────"

if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    echo "   SELECT COUNT(*) FROM agent_departments:"
    psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM agent_departments;" 2>&1 | head -5

    echo ""
    echo "   All departments:"
    psql "$DATABASE_URL" -c "SELECT department_name, status FROM agent_departments ORDER BY department_name;" 2>&1 | head -20
else
    echo "   ⚠️  psql not available"
fi

echo ""
echo "3️⃣  CREWAI_AGENTS TABLE"
echo "   ─────────────────────────────────────────────────────────────"

if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    echo "   SELECT COUNT(*) FROM crewai_agents:"
    psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM crewai_agents;" 2>&1 | head -5

    echo ""
    echo "   All agents with departments:"
    psql "$DATABASE_URL" -c "
      SELECT
        ca.agent_key,
        ca.name,
        ca.role,
        ca.status,
        ad.department_name
      FROM crewai_agents ca
      LEFT JOIN agent_departments ad ON ca.department_id = ad.id
      ORDER BY ca.name;
    " 2>&1 | head -20
else
    echo "   ⚠️  psql not available"
fi

echo ""
echo "4️⃣  CREWAI_CREWS TABLE"
echo "   ─────────────────────────────────────────────────────────────"

if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    echo "   SELECT COUNT(*) FROM crewai_crews:"
    psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM crewai_crews;" 2>&1 | head -5

    echo ""
    echo "   All crews:"
    psql "$DATABASE_URL" -c "SELECT crew_name, crew_type, status FROM crewai_crews;" 2>&1 | head -15
else
    echo "   ⚠️  psql not available"
fi

echo ""
echo "5️⃣  CREW_MEMBERS TABLE"
echo "   ─────────────────────────────────────────────────────────────"

if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
    echo "   SELECT COUNT(*) FROM crew_members:"
    psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM crew_members;" 2>&1 | head -5

    echo ""
    echo "   Crew membership:"
    psql "$DATABASE_URL" -c "
      SELECT
        c.crew_name,
        a.name as agent_name,
        cm.role_in_crew,
        cm.sequence_order
      FROM crew_members cm
      JOIN crewai_crews c ON cm.crew_id = c.id
      JOIN crewai_agents a ON cm.agent_id = a.id
      ORDER BY c.crew_name, cm.sequence_order;
    " 2>&1 | head -20
else
    echo "   ⚠️  psql not available"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""
