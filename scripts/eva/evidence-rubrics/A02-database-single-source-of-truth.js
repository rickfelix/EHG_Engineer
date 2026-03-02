/** A02: database_single_source_of_truth — All state persisted in Supabase; no alternative sources of truth. */
export default {
  id: 'A02', name: 'database_single_source_of_truth',
  checks: [
    { id: 'A02-C1', label: 'Supabase client used throughout the codebase',
      type: 'code_pattern', weight: 20,
      params: { glob: 'lib/eva/**/*.js', pattern: 'supabase|createClient.*supabase', minMatches: 5 } },
    { id: 'A02-C2', label: 'Database migrations directory has migration files',
      type: 'file_count', weight: 25,
      params: { glob: 'supabase/migrations/*.sql', minCount: 10 } },
    { id: 'A02-C3', label: 'Artifacts stored in DB tables (venture_artifacts or similar)',
      type: 'code_pattern', weight: 25,
      params: { glob: 'lib/eva/artifact-versioning.js', pattern: 'venture_artifacts|insert|upsert' } },
    { id: 'A02-C4', label: 'No file-based state for venture data (no JSON flat-file state)',
      type: 'anti_pattern', weight: 15,
      params: { glob: 'lib/eva/services/**/*.js', pattern: 'writeFileSync.*state|readFileSync.*state\\.json', maxMatches: 0 } },
    { id: 'A02-C5', label: 'Strategic directives stored in database table',
      type: 'db_row_exists', weight: 15,
      params: { table: 'strategic_directives_v2' } },
  ],
};
