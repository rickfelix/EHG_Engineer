/**
 * SpecDrivenSchemaGen Component - Stage 16
 * Specification-Driven Schema Generation
 *
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 * Phase: THE BLUEPRINT
 */

import React, { useState } from 'react';
import { Code, FileJson, Database, Copy, Check, ChevronRight, ChevronLeft, RefreshCw, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const SAMPLE_SCHEMA = `-- Generated Schema for Venture MVP
-- Stage 16: Spec-Driven Schema Generation

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'pending',
  total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);`;

const SAMPLE_TYPES = `// TypeScript Interfaces - Generated from Schema

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price: number;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  total: number;
  created_at: string;
}`;

const DEFAULT_SPEC_DATA = { sqlSchema: SAMPLE_SCHEMA, typeDefinitions: SAMPLE_TYPES };

export default function SpecDrivenSchemaGen({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: specData,
    setData: setSpecData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 16, 'sql_schema', DEFAULT_SPEC_DATA);

  const [activeTab, setActiveTab] = useState('sql');
  const [copied, setCopied] = useState(false);

  const currentData = specData || DEFAULT_SPEC_DATA;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeTab === 'sql' ? SAMPLE_SCHEMA : SAMPLE_TYPES);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    await saveArtifact(currentData, 'SQL Schema');
  };

  const handleComplete = async () => {
    await saveArtifact(currentData, 'SQL Schema');
    onStageComplete?.();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading schema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
            <Code className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 16: Spec-Driven Schema Generation</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">THE BLUEPRINT</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4">
          <nav className="flex -mb-px">
            {[
              { id: 'sql', label: 'SQL Schema', icon: Database },
              { id: 'typescript', label: 'TypeScript', icon: FileJson }
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === tab.id ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'
                }`}>
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-green-600">
              <RefreshCw className="w-4 h-4" /> Regenerate
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
          <pre className="text-sm text-gray-100 font-mono whitespace-pre">
            {activeTab === 'sql' ? SAMPLE_SCHEMA : SAMPLE_TYPES}
          </pre>
        </div>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">3</div>
            <div className="text-xs text-gray-500">Tables Generated</div>
          </div>
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">2</div>
            <div className="text-xs text-gray-500">RLS Policies</div>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
            <div className="text-2xl font-bold text-purple-600">3</div>
            <div className="text-xs text-gray-500">TypeScript Interfaces</div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onPrevious} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && <span className="text-xs text-gray-400">Last saved: {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
