const pg = require('pg');
const fs = require('fs');
const path = require('path');

// Parse .env file manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');

let dbPassword = '';

envContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_DB_PASSWORD=')) {
    dbPassword = line.split('=')[1].trim().replace(/['"]/g, '');
  }
});

if (!dbPassword) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env file');
  process.exit(1);
}

// Build connection string for Engineer database
const projectId = 'dedlbzhpgkmetvhbkyzq';
const region = 'aws-1-us-east-1';
const connStr = `postgresql://postgres.${projectId}:${encodeURIComponent(dbPassword)}@${region}.pooler.supabase.com:5432/postgres`;

async function getVWCDetails() {
  const client = new pg.Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    // Get the two specific SDs
    const specificResult = await client.query(`
      SELECT *
      FROM strategic_directives_v2
      WHERE id IN ('SD-VWC-PHASE3-001', 'SD-VWC-PHASE4-001')
      ORDER BY id
    `);

    console.log('=== SD-VWC-PHASE3-001 & SD-VWC-PHASE4-001 Details ===\n');
    specificResult.rows.forEach(sd => {
      console.log(`SD ID: ${sd.id}`);
      console.log(`Title: ${sd.title}`);
      console.log(`Category: ${sd.category}`);
      console.log(`Priority: ${sd.priority}`);
      console.log(`Status: ${sd.status}`);
      console.log(`Sequence Rank: ${sd.sequence_rank || 'NOT SET'}`);
      console.log(`Description: ${sd.description}`);
      console.log(`Dependencies: ${JSON.stringify(sd.dependencies, null, 2)}`);
      console.log(`Metadata: ${JSON.stringify(sd.metadata, null, 2)}`);
      console.log(`Progress: ${sd.progress_percentage || sd.progress || 'Not set'}%`);
      console.log(`Current Phase: ${sd.current_phase || 'Not set'}`);
      console.log(`Created: ${sd.created_at}`);
      console.log(`Updated: ${sd.updated_at}`);
      console.log('---\n');
    });

    // Get all 5 active VWC SDs for comparison
    const allVWCResult = await client.query(`
      SELECT id, title, category, priority, status, sequence_rank,
             dependencies, metadata, progress_percentage, progress, current_phase
      FROM strategic_directives_v2
      WHERE id LIKE 'SD-VWC-%'
        AND status = 'draft'
      ORDER BY
        CASE WHEN sequence_rank IS NULL THEN 1 ELSE 0 END,
        sequence_rank,
        id
    `);

    console.log('\n=== ALL 5 VWC DRAFT SDs COMPARISON ===\n');
    console.log('Sorted by: sequence_rank (if set), then id\n');

    allVWCResult.rows.forEach((sd, idx) => {
      console.log(`${idx + 1}. ${sd.id} (Seq: ${sd.sequence_rank || 'UNSET'})`);
      console.log(`   Title: ${sd.title}`);
      console.log(`   Priority: ${sd.priority}`);
      console.log(`   Status: ${sd.status}`);
      console.log(`   Dependencies: ${JSON.stringify(sd.dependencies)}`);
      console.log(`   Progress: ${sd.progress_percentage || sd.progress || 0}%`);
      console.log(`   Current Phase: ${sd.current_phase || 'Not set'}`);

      // Extract business value from metadata if present
      const bv = sd.metadata?.business_value || sd.metadata?.businessValue || 'Not specified';
      console.log(`   Business Value: ${bv}`);
      console.log('');
    });

    console.log('\n=== SUMMARY TABLE ===');
    console.log('SD ID                 | Priority | Seq Rank | Progress | Dependencies');
    console.log('----------------------|----------|----------|----------|-------------');
    allVWCResult.rows.forEach(sd => {
      const sdId = sd.id.padEnd(20);
      const priority = (sd.priority || '').padEnd(8);
      const seqRank = String(sd.sequence_rank || '-').padEnd(8);
      const progress = String(sd.progress_percentage || sd.progress || 0).padEnd(8);
      const deps = sd.dependencies ? JSON.stringify(sd.dependencies) : 'None';
      console.log(`${sdId} | ${priority} | ${seqRank} | ${progress}% | ${deps}`);
    });

  } catch (error) {
    console.error('Error querying database:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

getVWCDetails().catch(console.error);
