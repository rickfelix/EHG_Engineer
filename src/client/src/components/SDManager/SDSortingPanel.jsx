import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save,
  RotateCcw,
  Trash2,
  GripVertical,
  Plus,
  RefreshCw
} from 'lucide-react';

/**
 * SDSortingPanel Component
 * Manages multi-level sorting UI for Strategic Directives including:
 * - Multi-level sort configuration
 * - Sort presets (save/load/delete)
 * - Visual sort level builder
 * - Reset functionality
 */
function SDSortingPanel({
  // Sorting State (from useSortingState hook)
  sortLevels,
  setSortLevels,
  savedSorts,
  setSavedSorts,
  resetToStrategicPriority,
  addSortLevel,
  removeSortLevel,
  updateSortLevel,
  loadPreset,
  savePreset,

  // UI State
  showSortingPanel,
  setShowSortingPanel,

  // Sizing
  isCompact = false
}) {
  const [sortPresetName, setSortPresetName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Field label mapping
  const fieldLabels = {
    'wsjf_score': 'WSJF Score',
    'priority': 'Priority',
    'status': 'Status',
    'progress': 'Progress',
    'sequenceRank': 'Sequence Rank',
    'created_at': 'Created Date',
    'updated_at': 'Last Updated',
    'title': 'Title',
    'id': 'ID',
    'readiness': 'Ready Score',
    'must_have_count': 'Story Count'
  };

  const handleFieldChange = (index, newField) => {
    updateSortLevel(index, {
      field: newField,
      label: fieldLabels[newField] || newField
    });
  };

  const handleDirectionToggle = (index) => {
    const currentLevel = sortLevels[index];
    updateSortLevel(index, {
      direction: currentLevel.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const handleSavePreset = () => {
    if (sortPresetName) {
      savePreset(sortPresetName);
      setShowSaveDialog(false);
      setSortPresetName('');
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
      <button
        onClick={() => setShowSortingPanel(!showSortingPanel)}
        className={`flex items-center gap-2 ${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200 w-full justify-between bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg`}
      >
        <div className="flex items-center gap-2">
          {showSortingPanel ?
            <ChevronDown className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} /> :
            <ChevronRight className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          }
          <ArrowUpDown className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          <span className="font-medium">Sorting</span>
        </div>

        <div className="flex items-center">
          <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-blue-600 dark:text-blue-400 font-medium`}>
            {sortLevels.map(level => level.label).join(' → ')}
          </span>
        </div>
      </button>

      {showSortingPanel && (
        <div className="mt-4 bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-800 dark:via-gray-750 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-lg transition-all duration-300 animate-in slide-in-from-top-2">

          {/* Sort Presets Bar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    loadPreset(e.target.value);
                  }
                }}
                className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg`}
                defaultValue=""
              >
                <option value="">Load Preset...</option>
                {Object.keys(savedSorts).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowSaveDialog(true)}
                className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2`}
              >
                <Save className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                Save Current
              </button>
              <button
                onClick={() => setSortLevels([{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }])}
                className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2`}
              >
                <RotateCcw className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                Reset
              </button>
            </div>
          </div>

          {/* Sort Levels */}
          <div className="space-y-3">
            {sortLevels.map((level, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-600">
                <GripVertical className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-400 cursor-move`} />

                <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400 w-20`}>
                  {index === 0 ? 'Primary' : index === 1 ? 'Secondary' : index === 2 ? 'Tertiary' : `Level ${index + 1}`}:
                </span>

                <select
                  value={level.field}
                  onChange={(e) => handleFieldChange(index, e.target.value)}
                  className={`flex-1 ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg`}
                >
                  <option value="wsjf_score">WSJF Score</option>
                  <option value="priority">Priority</option>
                  <option value="status">Status</option>
                  <option value="progress">Progress</option>
                  <option value="sequenceRank">Sequence Rank</option>
                  <option value="created_at">Created Date</option>
                  <option value="updated_at">Last Updated</option>
                  <option value="title">Title</option>
                  <option value="id">ID</option>
                  <option value="readiness">Ready Score</option>
                  <option value="must_have_count">Story Count</option>
                </select>

                <button
                  onClick={() => handleDirectionToggle(index)}
                  className={`${isCompact ? 'px-3 py-2' : 'px-4 py-2.5'} bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2`}
                >
                  {level.direction === 'asc' ?
                    <ArrowUp className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} /> :
                    <ArrowDown className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                  }
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'}`}>
                    {level.direction === 'asc' ? 'Ascending' : 'Descending'}
                  </span>
                </button>

                {sortLevels.length > 1 && (
                  <button
                    onClick={() => removeSortLevel(index)}
                    className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add Sort Level Button */}
          {sortLevels.length < 5 && (
            <button
              onClick={addSortLevel}
              className={`mt-3 ${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 w-full flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400`}
            >
              <Plus className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
              Add Sort Level
            </button>
          )}

          {/* Reset to Strategic Priority Sort Button */}
          <button
            onClick={resetToStrategicPriority}
            className={`mt-3 ${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-blue-600 text-white rounded-lg hover:bg-blue-700 w-full flex items-center justify-center gap-2`}
          >
            <RefreshCw className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
            Reset to Strategic Priority Sort
          </button>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
                <h3 className="text-lg font-semibold mb-4">Save Sort Configuration</h3>
                <input
                  type="text"
                  value={sortPresetName}
                  onChange={(e) => setSortPresetName(e.target.value)}
                  placeholder="Enter preset name..."
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg mb-4"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setShowSaveDialog(false);
                      setSortPresetName('');
                    }}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePreset}
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowSortingPanel(false)}
              className={`${isCompact ? 'px-4 py-1.5 text-xs' : 'px-6 py-2 text-sm'} bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg transition-all duration-200 flex items-center gap-2 font-medium shadow-md hover:shadow-lg transform hover:scale-105`}
            >
              <ChevronUp className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
              Apply Sorting
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default SDSortingPanel;
