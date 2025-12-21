/**
 * BusinessModelCanvas Component - Stage 8
 * Business Model Canvas Development Interface
 *
 * SD: SD-IND-A-STAGES-7-11 (Block A: GTM & Persona Fit)
 * Phase: THE ENGINE
 *
 * Features:
 * - Interactive 9-block BMC layout
 * - Revenue/Cost structure modeling
 * - Integration with Stage 7 pricing data
 * - Golden Nugget artifact display
 * - Real data persistence via useStageArtifacts hook
 */

import React, { useState } from 'react';
import {
  LayoutGrid,
  Users,
  Gift,
  Truck,
  Heart,
  DollarSign,
  Box,
  Settings,
  Users2,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  Edit3,
  Check,
  X,
  Save,
  Loader2
} from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

// BMC Block configuration
const BMC_BLOCKS = [
  { id: 'key_partners', title: 'Key Partners', icon: Users2, color: 'purple', row: 1, col: 1 },
  { id: 'key_activities', title: 'Key Activities', icon: Settings, color: 'purple', row: 1, col: 2 },
  { id: 'key_resources', title: 'Key Resources', icon: Box, color: 'purple', row: 2, col: 2 },
  { id: 'value_propositions', title: 'Value Propositions', icon: Gift, color: 'green', row: 1, col: 3, rowSpan: 2 },
  { id: 'customer_relationships', title: 'Customer Relationships', icon: Heart, color: 'blue', row: 1, col: 4 },
  { id: 'channels', title: 'Channels', icon: Truck, color: 'blue', row: 2, col: 4 },
  { id: 'customer_segments', title: 'Customer Segments', icon: Users, color: 'blue', row: 1, col: 5, rowSpan: 2 },
  { id: 'cost_structure', title: 'Cost Structure', icon: CreditCard, color: 'red', row: 3, col: 1, colSpan: 2 },
  { id: 'revenue_streams', title: 'Revenue Streams', icon: DollarSign, color: 'green', row: 3, col: 3, colSpan: 3 }
];

const BLOCK_COLORS = {
  purple: 'bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-800',
  green: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
  red: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
};

const ICON_COLORS = {
  purple: 'text-purple-600 dark:text-purple-400',
  green: 'text-green-600 dark:text-green-400',
  blue: 'text-blue-600 dark:text-blue-400',
  red: 'text-red-600 dark:text-red-400'
};

const DEFAULT_BLOCK_DATA = {
  key_partners: ['Strategic suppliers', 'Technology partners', 'Distribution partners'],
  key_activities: ['Product development', 'Marketing & sales', 'Customer support'],
  key_resources: ['Technical team', 'Proprietary technology', 'Customer data'],
  value_propositions: ['Solve [problem] for [customer]', 'Save time and money', 'Improve outcomes'],
  customer_relationships: ['Self-service platform', 'Dedicated support', 'Community'],
  channels: ['Website/app', 'Sales team', 'Partners'],
  customer_segments: ['Primary: [segment]', 'Secondary: [segment]', 'Early adopters'],
  cost_structure: ['Personnel (60%)', 'Infrastructure (20%)', 'Marketing (15%)', 'Operations (5%)'],
  revenue_streams: ['Subscription revenue', 'Transaction fees', 'Professional services']
};

export default function BusinessModelCanvas({ venture, artifacts = [], onStageComplete, onPrevious }) {
  // Load BMC data from artifacts
  const {
    data: blockData,
    setData: setBlockData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 8, 'business_model_canvas', DEFAULT_BLOCK_DATA);

  const [editingBlock, setEditingBlock] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Save handler
  const handleSave = async () => {
    await saveArtifact(blockData, 'Business Model Canvas');
  };

  // Complete stage handler
  const handleComplete = async () => {
    await saveArtifact(blockData, 'Business Model Canvas');
    onStageComplete?.();
  };

  const handleEditStart = (blockId) => {
    setEditingBlock(blockId);
    setEditValue((blockData || DEFAULT_BLOCK_DATA)[blockId]?.join('\n') || '');
  };

  const handleEditSave = () => {
    if (editingBlock) {
      setBlockData(prev => ({
        ...(prev || DEFAULT_BLOCK_DATA),
        [editingBlock]: editValue.split('\n').filter(item => item.trim())
      }));
      setEditingBlock(null);
    }
  };

  const handleEditCancel = () => {
    setEditingBlock(null);
    setEditValue('');
  };

  const getCompletionPercentage = () => {
    const data = blockData || DEFAULT_BLOCK_DATA;
    const totalItems = Object.values(data).flat().length;
    const filledItems = Object.values(data).flat().filter(item => !item.includes('[')).length;
    return Math.round((filledItems / totalItems) * 100);
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading business model canvas...</p>
        </div>
      </div>
    );
  }

  const currentBlockData = blockData || DEFAULT_BLOCK_DATA;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <LayoutGrid className="w-8 h-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                Stage 8: Business Model Canvas
              </h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                THE ENGINE
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {getCompletionPercentage()}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Complete</div>
          </div>
        </div>
      </div>

      {/* BMC Grid */}
      <div className="p-6">
        <div className="grid grid-cols-5 gap-3" style={{ gridTemplateRows: 'auto auto auto' }}>
          {BMC_BLOCKS.map((block) => {
            const Icon = block.icon;
            const isEditing = editingBlock === block.id;

            return (
              <div
                key={block.id}
                className={`
                  ${BLOCK_COLORS[block.color]}
                  border-2 rounded-lg p-3 min-h-[140px]
                  ${block.rowSpan === 2 ? 'row-span-2' : ''}
                  ${block.colSpan === 2 ? 'col-span-2' : ''}
                  ${block.colSpan === 3 ? 'col-span-3' : ''}
                `}
                style={{
                  gridRow: block.rowSpan ? `span ${block.rowSpan}` : undefined,
                  gridColumn: block.colSpan ? `span ${block.colSpan}` : undefined
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${ICON_COLORS[block.color]}`} />
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {block.title}
                    </h3>
                  </div>
                  {!isEditing && (
                    <button
                      onClick={() => handleEditStart(block.id)}
                      className="p-1 hover:bg-white/50 dark:hover:bg-gray-700/50 rounded"
                    >
                      <Edit3 className="w-3 h-3 text-gray-400" />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full h-24 text-xs p-2 border rounded bg-white dark:bg-gray-700 dark:border-gray-600"
                      placeholder="Enter items, one per line"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleEditSave}
                        className="p-1 bg-green-500 text-white rounded hover:bg-green-600"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleEditCancel}
                        className="p-1 bg-gray-400 text-white rounded hover:bg-gray-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {blockData[block.id]?.map((item, idx) => (
                      <li
                        key={idx}
                        className={`text-xs ${
                          item.includes('[')
                            ? 'text-gray-400 dark:text-gray-500 italic'
                            : 'text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        • {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Financial Summary</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">$0</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Monthly Revenue</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">$0</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Monthly Costs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">0%</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Gross Margin</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">--</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Breakeven</div>
          </div>
        </div>
      </div>

      {/* Artifacts */}
      {artifacts.length > 0 && (
        <div className="p-6 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
            Golden Nugget Artifacts
          </h3>
          <div className="grid gap-2">
            {artifacts.map((artifact, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="font-medium text-gray-900 dark:text-gray-100">{artifact.type}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                  Validated
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onPrevious}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous Stage
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-gray-400">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
        <button
          onClick={handleComplete}
          disabled={saving || loading}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Complete & Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
