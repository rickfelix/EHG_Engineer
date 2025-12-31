#!/usr/bin/env node
/**
 * Genesis Virtual Bunker - Scaffold Pattern Seeder
 *
 * Seeds the scaffold_patterns table with initial patterns for all 9 types.
 * Part of SD-GENESIS-V31-MASON-P1
 *
 * Usage:
 *   node scripts/seed-scaffold-patterns.js
 *   node scripts/seed-scaffold-patterns.js --force  # Clear and reseed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Schema: pattern_name, pattern_type, template_code, variables, dependencies, version
const PATTERNS = [
  // COMPONENT PATTERNS (5)
  {
    pattern_name: 'DataTable',
    pattern_type: 'component',
    template_code: `export function DataTable({ data, columns, onSort }) {
  return (
    <table className="w-full border-collapse">
      <thead><tr>{columns.map(col => <th key={col.key} className="p-2 border">{col.label}</th>)}</tr></thead>
      <tbody>{data.map(row => <tr key={row.id}>{columns.map(col => <td key={col.key} className="p-2 border">{row[col.key]}</td>)}</tr>)}</tbody>
    </table>
  );
}`,
    variables: ['data', 'columns', 'onSort'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'FormField',
    pattern_type: 'component',
    template_code: `export function FormField({ label, error, children }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}`,
    variables: ['label', 'error', 'children'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'Modal',
    pattern_type: 'component',
    template_code: `export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl">
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded">Close</button>
      </div>
    </div>
  );
}`,
    variables: ['isOpen', 'onClose', 'title', 'children'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'Card',
    pattern_type: 'component',
    template_code: `export function Card({ title, children, footer }) {
  return (
    <div className="border rounded-lg shadow-sm">
      {title && <div className="p-4 border-b font-medium">{title}</div>}
      <div className="p-4">{children}</div>
      {footer && <div className="p-4 border-t bg-gray-50">{footer}</div>}
    </div>
  );
}`,
    variables: ['title', 'children', 'footer'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'LoadingSpinner',
    pattern_type: 'component',
    template_code: `export function LoadingSpinner({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
      <span className="text-gray-600">{message}</span>
    </div>
  );
}`,
    variables: ['message'],
    dependencies: ['react'],
  },

  // HOOK PATTERNS (3)
  {
    pattern_name: 'useDebounce',
    pattern_type: 'hook',
    template_code: `export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}`,
    variables: ['value', 'delay'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'useLocalStorage',
    pattern_type: 'hook',
    template_code: `export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}`,
    variables: ['key', 'initialValue'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'useFetch',
    pattern_type: 'hook',
    template_code: `export function useFetch(url, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(url, options)
      .then(res => res.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);
  return { data, loading, error };
}`,
    variables: ['url', 'options'],
    dependencies: ['react'],
  },

  // SERVICE PATTERNS (3)
  {
    pattern_name: 'CRUDService',
    pattern_type: 'service',
    template_code: `export class CRUDService {
  constructor(tableName, supabase) { this.table = tableName; this.db = supabase; }
  async getAll() { return await this.db.from(this.table).select('*'); }
  async getById(id) { return await this.db.from(this.table).select('*').eq('id', id).single(); }
  async create(data) { return await this.db.from(this.table).insert(data).select().single(); }
  async update(id, data) { return await this.db.from(this.table).update(data).eq('id', id).select().single(); }
  async delete(id) { return await this.db.from(this.table).delete().eq('id', id); }
}`,
    variables: ['tableName', 'supabase'],
    dependencies: ['@supabase/supabase-js'],
  },
  {
    pattern_name: 'AuthService',
    pattern_type: 'service',
    template_code: `export const AuthService = {
  async signIn(email, password) { return await supabase.auth.signInWithPassword({ email, password }); },
  async signUp(email, password) { return await supabase.auth.signUp({ email, password }); },
  async signOut() { return await supabase.auth.signOut(); },
  async getUser() { return await supabase.auth.getUser(); },
  async getSession() { return await supabase.auth.getSession(); }
};`,
    variables: ['supabase'],
    dependencies: ['@supabase/supabase-js'],
  },
  {
    pattern_name: 'CacheService',
    pattern_type: 'service',
    template_code: `export class CacheService {
  constructor() { this.cache = new Map(); }
  set(key, value, ttlMs = 60000) {
    this.cache.set(key, { value, expires: Date.now() + ttlMs });
    setTimeout(() => this.cache.delete(key), ttlMs);
  }
  get(key) {
    const item = this.cache.get(key);
    if (!item || item.expires < Date.now()) { this.cache.delete(key); return null; }
    return item.value;
  }
  clear() { this.cache.clear(); }
}`,
    variables: [],
    dependencies: [],
  },

  // PAGE PATTERNS (2)
  {
    pattern_name: 'ListPage',
    pattern_type: 'page',
    template_code: `export default function ListPage() {
  const { data, loading, error } = useFetch('/api/items');
  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Items</h1>
      <DataTable data={data} columns={[{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }]} />
    </div>
  );
}`,
    variables: ['apiEndpoint', 'columns'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'DetailPage',
    pattern_type: 'page',
    template_code: `export default function DetailPage({ params }) {
  const { data, loading, error } = useFetch(\`/api/items/\${params.id}\`);
  if (loading) return <LoadingSpinner />;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{data.name}</h1>
      <Card><pre>{JSON.stringify(data, null, 2)}</pre></Card>
    </div>
  );
}`,
    variables: ['params', 'apiEndpoint'],
    dependencies: ['react'],
  },

  // LAYOUT PATTERNS (2)
  {
    pattern_name: 'DashboardLayout',
    pattern_type: 'layout',
    template_code: `export function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-800 text-white p-4">
        <nav>{/* Navigation items */}</nav>
      </aside>
      <main className="flex-1 p-6 bg-gray-100">{children}</main>
    </div>
  );
}`,
    variables: ['children'],
    dependencies: ['react'],
  },
  {
    pattern_name: 'AuthLayout',
    pattern_type: 'layout',
    template_code: `export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">{children}</div>
    </div>
  );
}`,
    variables: ['children'],
    dependencies: ['react'],
  },

  // API_ROUTE PATTERNS (2)
  {
    pattern_name: 'RestApiHandler',
    pattern_type: 'api_route',
    template_code: `export async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data } = await supabase.from('items').select('*');
      return res.status(200).json({ success: true, data });
    }
    if (req.method === 'POST') {
      const { data } = await supabase.from('items').insert(req.body).select().single();
      return res.status(201).json({ success: true, data });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}`,
    variables: ['tableName'],
    dependencies: ['@supabase/supabase-js'],
  },
  {
    pattern_name: 'AuthMiddleware',
    pattern_type: 'api_route',
    template_code: `export async function withAuth(handler) {
  return async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    return handler(req, res);
  };
}`,
    variables: [],
    dependencies: ['@supabase/supabase-js'],
  },

  // DATABASE_TABLE PATTERNS (2)
  {
    pattern_name: 'BasicTable',
    pattern_type: 'database_table',
    template_code: `CREATE TABLE IF NOT EXISTS {{table_name}} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON {{table_name}}
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();`,
    variables: ['table_name'],
    dependencies: [],
  },
  {
    pattern_name: 'UserOwnedTable',
    pattern_type: 'database_table',
    template_code: `CREATE TABLE IF NOT EXISTS {{table_name}} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_{{table_name}}_user_id ON {{table_name}}(user_id);`,
    variables: ['table_name'],
    dependencies: [],
  },

  // RLS_POLICY PATTERNS (2)
  {
    pattern_name: 'PublicReadPolicy',
    pattern_type: 'rls_policy',
    template_code: `ALTER TABLE {{table_name}} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON {{table_name}}
  FOR SELECT TO authenticated, anon USING (true);`,
    variables: ['table_name'],
    dependencies: [],
  },
  {
    pattern_name: 'OwnRowsPolicy',
    pattern_type: 'rls_policy',
    template_code: `ALTER TABLE {{table_name}} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_rows" ON {{table_name}}
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());`,
    variables: ['table_name'],
    dependencies: [],
  },

  // MIGRATION PATTERNS (2)
  {
    pattern_name: 'AddColumn',
    pattern_type: 'migration',
    template_code: `-- Migration: Add {{column_name}} to {{table_name}}
-- Up
ALTER TABLE {{table_name}} ADD COLUMN IF NOT EXISTS {{column_name}} {{column_type}};

-- Down
ALTER TABLE {{table_name}} DROP COLUMN IF EXISTS {{column_name}};`,
    variables: ['table_name', 'column_name', 'column_type'],
    dependencies: [],
  },
  {
    pattern_name: 'CreateJoinTable',
    pattern_type: 'migration',
    template_code: `-- Migration: Create {{table_name}} join table
CREATE TABLE IF NOT EXISTS {{table_name}} (
  {{table_a}}_id UUID NOT NULL REFERENCES {{table_a}}(id) ON DELETE CASCADE,
  {{table_b}}_id UUID NOT NULL REFERENCES {{table_b}}(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ({{table_a}}_id, {{table_b}}_id)
);

CREATE INDEX idx_{{table_name}}_{{table_a}} ON {{table_name}}({{table_a}}_id);
CREATE INDEX idx_{{table_name}}_{{table_b}} ON {{table_name}}({{table_b}}_id);`,
    variables: ['table_name', 'table_a', 'table_b'],
    dependencies: [],
  },
];

async function seedPatterns(force = false) {
  console.log('🌱 Seeding scaffold patterns...\n');

  // Check existing count
  const { data: existing, error: countError } = await supabase
    .from('scaffold_patterns')
    .select('id');

  if (countError) {
    console.error('Error checking existing patterns:', countError.message);
    process.exit(1);
  }

  const existingCount = existing?.length || 0;
  console.log(`📊 Existing patterns: ${existingCount}`);

  if (existingCount > 0 && !force) {
    console.log('⚠️  Patterns already exist. Use --force to clear and reseed.');
    process.exit(0);
  }

  // Clear existing if force
  if (force && existingCount > 0) {
    console.log('🗑️  Clearing existing patterns...');
    const { error: deleteError } = await supabase
      .from('scaffold_patterns')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('Error clearing patterns:', deleteError.message);
      process.exit(1);
    }
    console.log('✅ Cleared existing patterns');
  }

  // Insert new patterns
  console.log(`\n📝 Inserting ${PATTERNS.length} patterns...`);

  const { data: inserted, error: insertError } = await supabase
    .from('scaffold_patterns')
    .insert(PATTERNS)
    .select('id, pattern_name, pattern_type');

  if (insertError) {
    console.error('Error inserting patterns:', insertError.message);
    process.exit(1);
  }

  // Count by type
  const byType = {};
  for (const pattern of inserted) {
    byType[pattern.pattern_type] = (byType[pattern.pattern_type] || 0) + 1;
  }

  console.log('\n✅ Patterns seeded successfully!\n');
  console.log('📊 Summary:');
  console.log(`   Total: ${inserted.length} patterns`);
  for (const [type, count] of Object.entries(byType).sort()) {
    console.log(`   - ${type}: ${count}`);
  }
}

const force = process.argv.includes('--force');
seedPatterns(force);
