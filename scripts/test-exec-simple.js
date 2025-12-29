import { validateEXECChecklist } from '../tools/validators/exec-checklist.ts';

const run = async () => {
  try {
    // Set env vars
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZGxiemhwZ2ttZXR2aGJreXpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MTE5MzcsImV4cCI6MjA3MjA4NzkzN30.o-AUQPUXAobkhMfdxa5g3oDkcneXNnmwK80KfAER16g';
    
    console.log('Testing EXEC checklist for PRD-SD-001...');
    const result = await validateEXECChecklist('PRD-SD-001');
    console.log('Result:', result);
  } catch (_error) {
    console.error('Error:', error);
  }
};

run();
