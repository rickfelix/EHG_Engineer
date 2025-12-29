#!/usr/bin/env node

/**
 * Simple dbexec - requires pg to be installed
 * This is a fallback if the bundle doesn't work
 */

const fs = require('fs');
const _path = require('path'); // Kept for potential future path operations
const { Client } = require('pg');

async function main() {
  const args = process.argv.slice(2);
  const files = [];
  let envFile = '.env.staging';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      envFile = args[++i];
    } else if (!args[i].startsWith('--')) {
      files.push(args[i]);
    }
  }

  if (!files.length) {
    console.error('Usage: node dbexec-simple.js <file.sql> [--env .env.staging]');
    process.exit(1);
  }

  // Load env file
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) {
        process.env[match[1]] = match[2];
      }
    }
  }

  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  });

  console.log(`Connecting to ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`);

  try {
    await client.connect();

    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      console.log(`Executing: ${file}`);
      const result = await client.query(sql);
      console.log(`✓ Success (${result.rowCount || 0} rows)`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch(console.error);