import { useState, useEffect } from 'react';

/**
 * Custom hook to manage multi-level sorting state with localStorage persistence
 * @returns {Object} Sorting state and setters
 */
export const useSortingState = () => {
  // Load sort levels from localStorage
  const [sortLevels, setSortLevels] = useState(() => {
    const saved = localStorage.getItem('sd-sort-levels');
    return saved ? JSON.parse(saved) : [
      { field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }
    ];
  });

  // Load saved sort presets from localStorage
  const [savedSorts, setSavedSorts] = useState(() => {
    const saved = localStorage.getItem('sd-saved-sorts');
    return saved ? JSON.parse(saved) : {
      'Strategic Priority': [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }],
      'Default': [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }],
      'WSJF Priority': [
        { field: 'wsjf_score', direction: 'desc', label: 'WSJF Score' },
        { field: 'status', direction: 'asc', label: 'Status' },
        { field: 'created_at', direction: 'desc', label: 'Created Date' }
      ],
      'Progress Tracking': [
        { field: 'progress', direction: 'asc', label: 'Progress' },
        { field: 'priority', direction: 'desc', label: 'Priority' },
        { field: 'title', direction: 'asc', label: 'Title' }
      ],
      'Recent Activity': [
        { field: 'updated_at', direction: 'desc', label: 'Last Updated' },
        { field: 'status', direction: 'asc', label: 'Status' }
      ]
    };
  });

  // Save sort levels to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sd-sort-levels', JSON.stringify(sortLevels));
  }, [sortLevels]);

  // Save saved sorts to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sd-saved-sorts', JSON.stringify(savedSorts));
  }, [savedSorts]);

  /**
   * Reset to default strategic priority sort
   */
  const resetToStrategicPriority = () => {
    const strategicSort = [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }];
    setSortLevels(strategicSort);

    const defaultSavedSorts = {
      'Strategic Priority': [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }],
      'Default': [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }],
      'WSJF Priority': [
        { field: 'wsjf_score', direction: 'desc', label: 'WSJF Score' },
        { field: 'status', direction: 'asc', label: 'Status' },
        { field: 'created_at', direction: 'desc', label: 'Created Date' }
      ],
      'Progress Tracking': [
        { field: 'progress', direction: 'asc', label: 'Progress' },
        { field: 'priority', direction: 'desc', label: 'Priority' },
        { field: 'title', direction: 'asc', label: 'Title' }
      ],
      'Recent Activity': [
        { field: 'updated_at', direction: 'desc', label: 'Last Updated' },
        { field: 'status', direction: 'asc', label: 'Status' }
      ]
    };
    setSavedSorts(defaultSavedSorts);
  };

  /**
   * Add a new sort level
   */
  const addSortLevel = () => {
    setSortLevels([...sortLevels, { field: 'priority', direction: 'desc', label: 'Priority' }]);
  };

  /**
   * Remove a sort level by index
   */
  const removeSortLevel = (index) => {
    setSortLevels(sortLevels.filter((_, i) => i !== index));
  };

  /**
   * Update a sort level by index
   */
  const updateSortLevel = (index, updates) => {
    const newLevels = [...sortLevels];
    newLevels[index] = { ...newLevels[index], ...updates };
    setSortLevels(newLevels);
  };

  /**
   * Load a saved sort preset
   */
  const loadPreset = (presetName) => {
    const preset = savedSorts[presetName];
    if (preset) {
      setSortLevels(preset);
    }
  };

  /**
   * Save current sort as a preset
   */
  const savePreset = (presetName) => {
    setSavedSorts({ ...savedSorts, [presetName]: sortLevels });
  };

  return {
    sortLevels,
    setSortLevels,
    savedSorts,
    setSavedSorts,
    resetToStrategicPriority,
    addSortLevel,
    removeSortLevel,
    updateSortLevel,
    loadPreset,
    savePreset
  };
};
