#!/bin/bash
# Launch Real Testing Campaign
# Starts autonomous batch testing with monitoring

set -e

echo "═══════════════════════════════════════════════════════════"
echo "🚀 REAL TESTING CAMPAIGN LAUNCHER"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Change to project directory
cd /mnt/c/_EHG/EHG_Engineer

# Pre-flight checks
echo "📋 Pre-flight Checks:"
echo "───────────────────────────────────────────────────────────"

# Check if EHG app exists
if [ ! -d "/mnt/c/_EHG/ehg" ]; then
  echo "❌ EHG application not found at /mnt/c/_EHG/ehg"
  exit 1
fi
echo "✅ EHG application found"

# Check if test scripts exist
if [ ! -f "/mnt/c/_EHG/ehg/package.json" ]; then
  echo "❌ EHG package.json not found"
  exit 1
fi
echo "✅ EHG package.json found"

# Check environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ SUPABASE_URL not set"
  exit 1
fi
echo "✅ Database credentials configured"

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found"
  exit 1
fi
echo "✅ Node.js available"

echo ""
echo "📊 Campaign Configuration:"
echo "───────────────────────────────────────────────────────────"

# Query number of SDs to test
SD_COUNT=$(node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await supabase
    .from('v_untested_sds')
    .select('id')
    .eq('status', 'completed')
    .eq('tested', false);
  console.log(data?.length || 0);
})();
" 2>/dev/null || echo "0")

echo "   SDs to test: $SD_COUNT"
echo "   Estimated runtime: $(( SD_COUNT * 5 / 60 )) hours (5 min avg per SD)"
echo "   Progress log: /tmp/batch-test-progress.log"
echo "   Error log: /tmp/batch-test-errors.log"
echo ""

# Confirm launch
read -p "🚀 Launch real testing campaign? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Campaign cancelled"
  exit 0
fi

echo ""
echo "🔬 Launching Real Testing Campaign..."
echo "═══════════════════════════════════════════════════════════"
echo ""

# Launch in background
nohup node scripts/batch-test-completed-sds-real.cjs > /tmp/real-testing-output.log 2>&1 &
PID=$!

# Save PID
echo $PID > /tmp/batch-test-pid.txt

echo "✅ Campaign launched in background"
echo "   Process ID: $PID"
echo "   PID file: /tmp/batch-test-pid.txt"
echo ""

echo "📊 Monitoring Options:"
echo "───────────────────────────────────────────────────────────"
echo "   Live monitor: node scripts/monitor-real-batch-testing.cjs"
echo "   Progress log: tail -f /tmp/batch-test-progress.log"
echo "   Error log: tail -f /tmp/batch-test-errors.log"
echo "   Full output: tail -f /tmp/real-testing-output.log"
echo ""

echo "🛑 To Stop Campaign:"
echo "───────────────────────────────────────────────────────────"
echo "   kill $PID"
echo "   (or: kill \$(cat /tmp/batch-test-pid.txt))"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "🎉 Real Testing Campaign is now running!"
echo "   Estimated completion: $(date -d "+$(( SD_COUNT * 5 ))minutes" 2>/dev/null || echo 'several hours')"
echo "═══════════════════════════════════════════════════════════"
