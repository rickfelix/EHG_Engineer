/**
 * GroupCreationModal Component
 * Compact modal for creating submission groups
 * Maintains minimal footprint while providing essential functionality
 */

import React, { useState } from 'react';
import { X, Users, AlertCircle } from 'lucide-react';

const GroupCreationModal = ({ isOpen, onClose, selectedSubmissions, onCreateGroup }) => {
  const [groupName, setGroupName] = useState('');
  const [combineMethod, setCombineMethod] = useState('chronological');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    setIsCreating(true);
    setError(null);
    
    try {
      await onCreateGroup({
        submission_ids: selectedSubmissions,
        group_name: groupName.trim(),
        method: combineMethod
      });
      onClose();
      // Reset form
      setGroupName('');
      setCombineMethod('chronological');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  const combineOptions = [
    { value: 'chronological', label: 'Chronological', desc: 'Keep time order' },
    { value: 'merge', label: 'Merge & Dedupe', desc: 'Remove duplicates' },
    { value: 'latest', label: 'Latest Priority', desc: 'Latest overrides' }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700">
        {/* Compact Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Combine {selectedSubmissions.length} Submissions
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 space-y-3">
          {error && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="text-xs">{error}</span>
            </div>
          )}

          {/* Group Name Input */}
          <div>
            <label htmlFor="group-name" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Group Name
            </label>
            <input
              type="text"
              id="group-name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="e.g., Dashboard UX Improvements"
              required
              maxLength={100}
            />
          </div>

          {/* Compact Method Selection */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Combine Method
            </label>
            <div className="grid grid-cols-1 gap-1">
              {combineOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center justify-between p-2 text-xs border rounded cursor-pointer transition-colors ${
                    combineMethod === option.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="combineMethod"
                      value={option.value}
                      checked={combineMethod === option.value}
                      onChange={(e) => setCombineMethod(e.target.value)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        — {option.desc}
                      </span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Compact Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!groupName.trim() || isCreating}
              className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? 'Creating...' : 'Combine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GroupCreationModal;