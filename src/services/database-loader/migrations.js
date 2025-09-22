const fs = require('fs');
const path = require('path');

function readSql(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf8');
}

async function applyFilesInOrder(client, files, { dryRun = false } = {}) {
  if (!Array.isArray(files) || files.length === 0) return;

  if (dryRun) {
    console.log(`[dry-run] Would apply ${files.length} files:`);
    files.forEach(f => console.log(`  - ${f}`));
    return;
  }

  await client.query('BEGIN');
  try {
    for (const f of files) {
      const sql = readSql(f);
      await client.query(sql);
      console.log(`✓ applied ${f}`);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

module.exports = { readSql, applyFilesInOrder };