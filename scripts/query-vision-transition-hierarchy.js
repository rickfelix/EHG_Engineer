import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'dedlbzhpgkmetvhbkyzq.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Fl!M32DaM00n!1',
  database: 'postgres'
});

async function querySDHierarchy() {
  try {
    await client.connect();
    console.log('Connected to database successfully\n');

    const query = `
      WITH RECURSIVE sd_hierarchy AS (
        -- Get the parent SD
        SELECT
          id,
          sd_code,
          title,
          status,
          parent_sd_id,
          progress_percentage,
          created_at,
          updated_at,
          0 as level,
          sd_code as sort_path
        FROM strategic_directives
        WHERE sd_code LIKE 'SD-VISION-TRANSITION-001'

        UNION ALL

        -- Get all descendants
        SELECT
          sd.id,
          sd.sd_code,
          sd.title,
          sd.status,
          sd.parent_sd_id,
          sd.progress_percentage,
          sd.created_at,
          sd.updated_at,
          h.level + 1,
          h.sort_path || '/' || sd.sd_code
        FROM strategic_directives sd
        INNER JOIN sd_hierarchy h ON sd.parent_sd_id = h.id
      )
      SELECT * FROM sd_hierarchy
      ORDER BY sort_path;
    `;

    const result = await client.query(query);

    console.log('================================================================================');
    console.log('SD-VISION-TRANSITION FAMILY HIERARCHY');
    console.log('================================================================================');
    console.log(`Total SDs found: ${result.rows.length}\n`);

    let currentLevel = -1;
    result.rows.forEach(row => {
      const indent = '  '.repeat(row.level);
      const levelIndicator = row.level === 0 ? '📁 PARENT' : row.level === 1 ? '📂 CHILD' : '📄 GRANDCHILD';

      if (row.level !== currentLevel) {
        console.log('');
        currentLevel = row.level;
      }

      console.log(`${indent}${levelIndicator}: ${row.sd_code}`);
      console.log(`${indent}    Title: ${row.title}`);
      console.log(`${indent}    Status: ${row.status}`);
      console.log(`${indent}    Progress: ${row.progress_percentage || 0}%`);
      console.log(`${indent}    Parent ID: ${row.parent_sd_id || 'None (root)'}`);
      console.log(`${indent}    Created: ${new Date(row.created_at).toISOString().split('T')[0]}`);
      console.log(`${indent}    Updated: ${new Date(row.updated_at).toISOString().split('T')[0]}`);
      console.log('');
    });

    console.log('================================================================================');
    console.log('SUMMARY STATISTICS');
    console.log('================================================================================');

    const statusCounts = result.rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    console.log('\nStatus Distribution:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    const avgProgress = result.rows.reduce((sum, row) => sum + (row.progress_percentage || 0), 0) / result.rows.length;
    console.log(`\nAverage Progress: ${avgProgress.toFixed(1)}%`);

    await client.end();
  } catch (error) {
    console.error('Error querying database:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

querySDHierarchy();
