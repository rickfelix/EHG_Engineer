#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Check for --exclude-parity flag
const excludeParity = process.argv.includes('--exclude-parity');

async function run() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status, priority, category, progress_percentage, scope, description, created_at')
    .in('status', ['draft', 'pending_approval', 'approved', 'active', 'in_progress'])
    .in('priority', ['critical', 'high'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  // Filter out PARITY SDs if flag is set
  let filtered = data;
  if (excludeParity) {
    filtered = data.filter(sd => {
      const upperID = sd.id.toUpperCase();
      return upperID.indexOf('PARITY') === -1;
    });
  }

  // Sort by priority (critical first) then by status
  const priorityOrder = { critical: 2, high: 1 };
  const statusOrder = { in_progress: 4, active: 3, pending_approval: 2, approved: 1, draft: 0 };

  const sorted = filtered.sort((a, b) => {
    const pDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    return (statusOrder[b.status] || 0) - (statusOrder[a.status] || 0);
  });

  const title = excludeParity
    ? 'HIGH & CRITICAL PRIORITY SDs (Excluding PARITY)'
    : 'HIGH & CRITICAL PRIORITY STRATEGIC DIRECTIVES';

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log(`           ${title}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  if (sorted.length === 0) {
    console.log('No matching SDs found.\n');
    return;
  }

  sorted.forEach((sd, idx) => {
    const priorityIcon = sd.priority === 'critical' ? '🔴 CRITICAL' : '🟠 HIGH';
    console.log(`${priorityIcon} | ${sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Status: ${sd.status.toUpperCase()} | Progress: ${sd.progress_percentage || 0}% | Category: ${sd.category || 'N/A'}`);
    if (sd.scope) {
      const scopeText = sd.scope.length > 300 ? sd.scope.substring(0, 300) + '...' : sd.scope;
      console.log(`   Scope: ${scopeText}`);
    }
    if (sd.description) {
      const descText = sd.description.length > 300 ? sd.description.substring(0, 300) + '...' : sd.description;
      console.log(`   Description: ${descText}`);
    }
    console.log('');
  });

  const critical = sorted.filter(sd => sd.priority === 'critical').length;
  const high = sorted.filter(sd => sd.priority === 'high').length;

  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log(`SUMMARY: ${critical} Critical + ${high} High = ${sorted.length} high-priority SDs`);
  console.log('═══════════════════════════════════════════════════════════════════════════════');
}

run();
