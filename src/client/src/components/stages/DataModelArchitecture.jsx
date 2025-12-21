/**
 * DataModelArchitecture Component - Stage 14
 * Data Model & Database Architecture Design
 *
 * SD: SD-IND-B-STAGES-12-16 (Block B: Sales & Operational Flow)
 * Phase: THE BLUEPRINT
 */

import React, { useState } from 'react';
import { Database, Table, Key, Link, ChevronRight, ChevronLeft, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const DEFAULT_ENTITIES = [
  { name: 'users', fields: ['id', 'email', 'name', 'created_at'], relationships: ['has_many: orders'] },
  { name: 'products', fields: ['id', 'name', 'price', 'description'], relationships: ['has_many: order_items'] },
  { name: 'orders', fields: ['id', 'user_id', 'status', 'total'], relationships: ['belongs_to: users', 'has_many: order_items'] }
];

const DEFAULT_SCHEMA_DATA = { entities: DEFAULT_ENTITIES };

export default function DataModelArchitecture({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: schemaData,
    setData: setSchemaData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 14, 'erd_diagram', DEFAULT_SCHEMA_DATA);

  const [activeTab, setActiveTab] = useState('entities');

  const currentData = schemaData || DEFAULT_SCHEMA_DATA;
  const entities = currentData.entities;

  const setEntities = (value) => {
    setSchemaData(prev => ({ ...(prev || DEFAULT_SCHEMA_DATA), entities: value }));
  };

  const handleSave = async () => {
    await saveArtifact(currentData, 'ERD Diagram');
  };

  const handleComplete = async () => {
    await saveArtifact(currentData, 'ERD Diagram');
    onStageComplete?.();
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading data model...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
            <Database className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 14: Data Model & Architecture</h2>
            <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">THE BLUEPRINT</span>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['entities', 'relationships', 'indexes'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'entities' && (
          <div className="space-y-4">
            {entities.map((entity, idx) => (
              <div key={idx} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Table className="w-5 h-5 text-green-500" />
                    <span className="font-mono font-bold text-gray-900 dark:text-gray-100">{entity.name}</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 rounded">
                    {entity.fields.length} fields
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entity.fields.map((field, fIdx) => (
                    <span key={fIdx} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
                      {field === 'id' && <Key className="w-3 h-3 inline mr-1 text-amber-500" />}
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <button className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:border-green-500 hover:text-green-500">
              <Plus className="w-4 h-4" /> Add Entity
            </button>
          </div>
        )}

        {activeTab === 'relationships' && (
          <div className="space-y-4">
            {entities.map((entity, idx) => (
              <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="font-mono font-bold text-gray-900 dark:text-gray-100 mb-2">{entity.name}</div>
                {entity.relationships.map((rel, rIdx) => (
                  <div key={rIdx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Link className="w-4 h-4 text-green-500" />
                    {rel}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'indexes' && (
          <div className="space-y-4">
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Recommended Indexes</h4>
              {[
                'users(email) - UNIQUE',
                'orders(user_id) - BTREE',
                'orders(created_at) - BTREE DESC',
                'products(name) - GIN (full-text)'
              ].map((idx, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-sm font-mono text-gray-600 dark:text-gray-400">
                  <Key className="w-3 h-3 text-amber-500" />
                  {idx}
                </div>
              ))}
            </div>
          </div>
        )}
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
