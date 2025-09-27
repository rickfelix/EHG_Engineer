import { createClient  } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Simulate the exact sorting function from SDManager
function performMultiLevelSort(directives, levels) {
  return [...directives].sort((a, b) => {
    // Skip completed SDs with is_working_on flag
    if (a.is_working_on && a.progress >= 100) return 1;
    if (b.is_working_on && b.progress >= 100) return -1;

    for (const level of levels) {
      let aValue = a[level.field];
      let bValue = b[level.field];

      // Handle special cases for different field types
      if (level.field === 'priority') {
        const priorityOrder = { 'critical': 1, 'high': 2, 'medium': 3, 'low': 4, 'minimal': 5 };
        aValue = priorityOrder[aValue?.toLowerCase()] || 999;
        bValue = priorityOrder[bValue?.toLowerCase()] || 999;
      } else if (level.field === 'status') {
        const statusOrder = { 'active': 1, 'draft': 2, 'in_progress': 3, 'pending_approval': 4, 'completed': 5 };
        aValue = statusOrder[aValue?.toLowerCase()] || 999;
        bValue = statusOrder[bValue?.toLowerCase()] || 999;
      } else if (level.field === 'wsjf_score') {
        // Calculate WSJF score if not present
        if (aValue === undefined || aValue === null) {
          const aPriority = a.priority?.toLowerCase();
          aValue = aPriority === 'critical' ? 100 : aPriority === 'high' ? 75 : aPriority === 'medium' ? 50 : 25;
        }
        if (bValue === undefined || bValue === null) {
          const bPriority = b.priority?.toLowerCase();
          bValue = bPriority === 'critical' ? 100 : bPriority === 'high' ? 75 : bPriority === 'medium' ? 50 : 25;
        }
      } else if (level.field === 'id') {
        // Extract numeric part from SD-XXX format
        const aMatch = aValue?.match(/SD-(\d+)/);
        const bMatch = bValue?.match(/SD-(\d+)/);
        aValue = aMatch ? parseInt(aMatch[1], 10) : 999999;
        bValue = bMatch ? parseInt(bMatch[1], 10) : 999999;
      }

      // Handle null/undefined values
      if (aValue === null || aValue === undefined) aValue = level.direction === 'asc' ? 999999 : -999999;
      if (bValue === null || bValue === undefined) bValue = level.direction === 'asc' ? 999999 : -999999;

      // Compare values based on direction
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      else if (aValue > bValue) comparison = 1;

      if (comparison !== 0) {
        return level.direction === 'asc' ? comparison : -comparison;
      }
    }
    return 0;
  });
}

async function debugSorting() {
  // Get all high-priority active SDs
  const { data: allSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('*');

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Apply the same filters as the UI
  const statusFilter = 'active,draft';
  const priorityFilter = 'critical,high';
  const applicationFilter = 'EHG';

  console.log('📊 FILTERING PROCESS');
  console.log('====================');
  console.log('Status filter:', statusFilter);
  console.log('Priority filter:', priorityFilter);
  console.log('Application filter:', applicationFilter);
  console.log('');

  const filteredDirectives = allSDs.filter(sd => {
    // Status filter
    let statusMatch = true;
    if (statusFilter !== 'all') {
      const sdStatus = sd.status?.toLowerCase();
      const statusValues = statusFilter.split(',');
      statusMatch = statusValues.some(status => sdStatus === status);
    }

    // Priority filter
    let priorityMatch = true;
    if (priorityFilter !== 'all') {
      const priorityValues = priorityFilter.split(',');
      priorityMatch = priorityValues.some(priority =>
        sd.priority?.toLowerCase() === priority.toLowerCase()
      );
    }

    // Application filter
    let applicationMatch = true;
    if (applicationFilter !== 'all') {
      applicationMatch = sd.targetApplication === applicationFilter;
    }

    return statusMatch && priorityMatch && applicationMatch;
  });

  console.log(`Filtered from ${allSDs.length} to ${filteredDirectives.length} SDs`);
  console.log('');

  // Test different sort configurations
  const sortConfigs = [
    [{ field: 'sequence_rank', direction: 'asc', label: 'Sequence Rank' }],
    [{ field: 'sequence_rank', direction: 'desc', label: 'Sequence Rank' }],
  ];

  for (const sortLevels of sortConfigs) {
    console.log(`📌 SORTING: ${sortLevels.map(l => `${l.label} (${l.direction})`).join(' → ')}`);
    console.log('='.repeat(60));

    const sorted = performMultiLevelSort(filteredDirectives, sortLevels);

    // Show first 10 and last 3
    sorted.slice(0, 10).forEach((sd, index) => {
      const rank = sd.sequence_rank !== null ? sd.sequence_rank : 'NULL';
      console.log(`${(index + 1).toString().padStart(2)}. ${sd.id.padEnd(10)} rank: ${String(rank).padEnd(4)} ${sd.title.substring(0, 35)}`);
    });

    if (sorted.length > 10) {
      console.log('...');
      sorted.slice(-3).forEach((sd, index) => {
        const position = sorted.length - 2 + index;
        const rank = sd.sequence_rank !== null ? sd.sequence_rank : 'NULL';
        console.log(`${position}. ${sd.id.padEnd(10)} rank: ${String(rank).padEnd(4)} ${sd.title.substring(0, 35)}`);
      });
    }
    console.log('');
  }

  // Check for any null sequence_rank values in our filtered set
  const nullRankSDs = filteredDirectives.filter(sd => sd.sequence_rank === null || sd.sequence_rank === undefined);
  if (nullRankSDs.length > 0) {
    console.log('⚠️  SDs WITH NULL sequence_rank:');
    console.log('================================');
    nullRankSDs.forEach(sd => {
      console.log(`${sd.id}: ${sd.title} (${sd.priority}, ${sd.status})`);
    });
  }
}

debugSorting();