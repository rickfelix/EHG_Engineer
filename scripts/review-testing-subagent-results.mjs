#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.dedlbzhpgkmetvhbkyzq',
  password: process.env.SUPABASE_DB_PASSWORD || 'Fl!M32DaM00n!1',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 TESTING Sub-Agent Results Review');
    console.log('════════════════════════════════════════════════════════════════\n');

    const result = await client.query(`
      SELECT 
        verdict,
        confidence,
        critical_issues,
        warnings,
        recommendations,
        detailed_analysis,
        metadata
      FROM sub_agent_execution_results
      WHERE sd_id = 'SD-BOARD-GOVERNANCE-001'
        AND sub_agent_code = 'TESTING'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('❌ No TESTING results found');
      return;
    }

    const r = result.rows[0];
    
    console.log(`Verdict: ${r.verdict}`);
    console.log(`Confidence: ${r.confidence}%\n`);
    
    console.log('Critical Issues:');
    if (Array.isArray(r.critical_issues)) {
      r.critical_issues.forEach(issue => console.log(`   ❌ ${issue}`));
    }
    console.log('');
    
    console.log('Warnings:');
    if (Array.isArray(r.warnings)) {
      r.warnings.forEach(warning => console.log(`   ⚠️  ${warning}`));
    }
    console.log('');
    
    console.log('Recommendations:');
    if (Array.isArray(r.recommendations)) {
      r.recommendations.forEach(rec => console.log(`   ✅ ${rec}`));
    }
    console.log('');
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Detailed Analysis:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(r.detailed_analysis);
    console.log('');
    
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Metadata:');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(JSON.stringify(r.metadata, null, 2));
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
