import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Sparkles, Wand2 } from 'lucide-react';
import SmartRefreshButton from '../SmartRefreshButton';
import SDFilters from './SDFilters';
import SDSortingPanel from './SDSortingPanel';
import SDList from './SDList';
import SDDetail from './SDDetail';
import { useSortingState } from './hooks/useSortingState';

/**
 * SDManager Component (Main Container)
 * Manages strategic directives with filtering, sorting, and viewing capabilities
 *
 * Responsibilities:
 * - Top-level state management
 * - Filter and sort application
 * - View mode switching (list/detail)
 * - URL-based navigation
 * - localStorage migration for filters
 */
function SDManager({
  strategicDirectives,
  onUpdateChecklist,
  onSetActiveSD,
  currentSD,
  isCompact,
  detailMode,
  onRefresh,
  onUpdateStatus,
  onUpdatePriority
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  // View state
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
  const [selectedSD, setSelectedSD] = useState(null);
  const [expandedSD, setExpandedSD] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  // Filter state with migration support
  const [statusFilter, setStatusFilter] = useState(() => {
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      localStorage.setItem('sd-filter-migration-v2', 'true');
      localStorage.setItem('sd-status-filter', 'active,draft');
      localStorage.setItem('sd-priority-filter', 'critical,high');
      localStorage.setItem('sd-application-filter', 'EHG');
      return 'active,draft';
    }
    return localStorage.getItem('sd-status-filter') || 'active,draft';
  });

  const [priorityFilter, setPriorityFilter] = useState(() => {
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      return 'critical,high';
    }
    return localStorage.getItem('sd-priority-filter') || 'critical,high';
  });

  const [applicationFilter, setApplicationFilter] = useState(() => {
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      return 'EHG';
    }
    return localStorage.getItem('sd-application-filter') || 'EHG';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showMetadataFilters, setShowMetadataFilters] = useState(false);

  // Sorting state (using custom hook)
  const {
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
  } = useSortingState();

  const [showSortingPanel, setShowSortingPanel] = useState(false);

  // Handle URL-based detail view with navigation guards
  useEffect(() => {
    if (detailMode && id) {
      console.log('Detail mode - Looking for SD with id:', id);
      console.log('Available SDs count:', strategicDirectives.length);

      if (strategicDirectives.length > 0) {
        console.log('First few SDs:', strategicDirectives.slice(0, 3).map(d => ({ id: d.id, title: d.title })));
      }

      const sd = strategicDirectives.find(d => d.id === id);
      if (sd) {
        console.log('Found SD:', sd.id, sd.title);
        setSelectedSD(sd);
        setViewMode('detail');
        document.title = `${sd.title || sd.id} - LEO Protocol Dashboard`;
      } else {
        if (strategicDirectives.length > 0) {
          console.warn(`SD with id '${id}' not found in ${strategicDirectives.length} directives, redirecting to list`);
          navigate('/strategic-directives', { replace: true });
        } else {
          console.log('Waiting for strategic directives to load...');
        }
      }
    } else if (!detailMode) {
      setViewMode('list');
      setSelectedSD(null);
      document.title = 'Strategic Directives - LEO Protocol Dashboard';
    }
  }, [id, detailMode, strategicDirectives, navigate]);

  // Filter directives
  const filteredDirectives = useMemo(() => {
    return strategicDirectives.filter(sd => {
      // Status filter - support multiple values
      let statusMatch = true;
      if (statusFilter !== 'all') {
        const sdStatus = sd.status?.toLowerCase();
        const statusValues = statusFilter.includes(',') ? statusFilter.split(',') : [statusFilter];
        statusMatch = statusValues.some(status => {
          if (status === 'active') return sdStatus === 'active';
          if (status === 'draft') return sdStatus === 'draft';
          if (status === 'deferred') return sdStatus === 'deferred';
          if (status === 'on_hold') return sdStatus === 'on_hold';
          if (status === 'cancelled') return sdStatus === 'cancelled';
          if (status === 'archived') return sdStatus === 'archived' || sdStatus === 'completed' || sdStatus === 'complete';
          return false;
        });
      }

      // Search filter
      let searchMatch = true;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        searchMatch =
          sd.id?.toLowerCase().includes(query) ||
          sd.title?.toLowerCase().includes(query) ||
          sd.description?.toLowerCase().includes(query);
      }

      // Priority filter - support multiple values
      let priorityMatch = true;
      if (priorityFilter !== 'all') {
        const priorityValues = priorityFilter.includes(',') ? priorityFilter.split(',') : [priorityFilter];
        priorityMatch = priorityValues.some(priority =>
          sd.priority?.toLowerCase() === priority.toLowerCase()
        );
      }

      // Application filter
      let applicationMatch = true;
      if (applicationFilter !== 'all') {
        applicationMatch = sd.targetApplication === applicationFilter;
      }

      // Category filter
      let categoryMatch = true;
      if (categoryFilter !== 'all') {
        categoryMatch = sd.category?.toLowerCase() === categoryFilter.toLowerCase();
      }

      return statusMatch && searchMatch && priorityMatch && applicationMatch && categoryMatch;
    });
  }, [strategicDirectives, statusFilter, searchQuery, priorityFilter, applicationFilter, categoryFilter]);

  // Multi-level sorting function
  const performMultiLevelSort = (directives, levels) => {
    return [...directives].sort((a, b) => {
      // Skip completed SDs with is_working_on flag
      if (a.is_working_on && a.progress >= 100) return 1;
      if (b.is_working_on && b.progress >= 100) return -1;

      for (const level of levels) {
        let aValue = a[level.field];
        let bValue = b[level.field];

        // Handle special cases for different field types
        if (level.field === 'priority') {
          const priorityOrder = { 'critical': 1, 'high': 2, 'medium': 3, 'low': 4, 'minimal': 5 };
          aValue = priorityOrder[aValue?.toLowerCase()] || 999;
          bValue = priorityOrder[bValue?.toLowerCase()] || 999;
        } else if (level.field === 'status') {
          const statusOrder = { 'active': 1, 'draft': 2, 'in_progress': 3, 'pending_approval': 4, 'completed': 5 };
          aValue = statusOrder[aValue?.toLowerCase()] || 999;
          bValue = statusOrder[bValue?.toLowerCase()] || 999;
        } else if (level.field === 'wsjf_score') {
          if (aValue === undefined || aValue === null) {
            const aPriority = a.priority?.toLowerCase();
            aValue = aPriority === 'critical' ? 100 : aPriority === 'high' ? 75 : aPriority === 'medium' ? 50 : 25;
          }
          if (bValue === undefined || bValue === null) {
            const bPriority = b.priority?.toLowerCase();
            bValue = bPriority === 'critical' ? 100 : bPriority === 'high' ? 75 : bPriority === 'medium' ? 50 : 25;
          }
        } else if (level.field === 'id') {
          const aMatch = aValue?.match(/SD-(\d+)/);
          const bMatch = bValue?.match(/SD-(\d+)/);
          aValue = aMatch ? parseInt(aMatch[1], 10) : 999999;
          bValue = bMatch ? parseInt(bMatch[1], 10) : 999999;
        } else if (level.field === 'sequenceRank') {
          aValue = typeof aValue === 'number' ? aValue : parseInt(aValue, 10) || 999999;
          bValue = typeof bValue === 'number' ? bValue : parseInt(bValue, 10) || 999999;
        }

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = level.direction === 'asc' ? 999999 : -999999;
        if (bValue === null || bValue === undefined) bValue = level.direction === 'asc' ? 999999 : -999999;

        // Compare values based on direction
        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        else if (aValue > bValue) comparison = 1;

        if (comparison !== 0) {
          return level.direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  };

  const sortedDirectives = useMemo(() => {
    return performMultiLevelSort(filteredDirectives, sortLevels);
  }, [filteredDirectives, sortLevels]);

  // Render detail view if selected
  if (viewMode === 'detail' && selectedSD) {
    return (
      <SDDetail
        sd={selectedSD}
        onUpdateChecklist={onUpdateChecklist}
      />
    );
  }

  // Render loading state if in detail mode but no SD selected yet
  if (viewMode === 'detail' && !selectedSD) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading strategic directive...</p>
        </div>
      </div>
    );
  }

  // Render list view
  return (
    <div className={isCompact ? 'p-3' : 'p-6'}>
      <div className={isCompact ? 'mb-3' : 'mb-6'}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white flex items-center`}>
              <Sparkles className="w-6 h-6 mr-2 text-primary-500 animate-pulse" />
              Strategic Directives
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <SmartRefreshButton
              onRefresh={onRefresh}
              isCompact={isCompact}
            />

            {/* New Directive Button */}
            <button
              onClick={() => navigate('/directive-lab?mode=quick')}
              className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
            >
              <Wand2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
              New Directive
            </button>
          </div>
        </div>

        {/* Filters Component */}
        <SDFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          applicationFilter={applicationFilter}
          setApplicationFilter={setApplicationFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          showMetadataFilters={showMetadataFilters}
          setShowMetadataFilters={setShowMetadataFilters}
          strategicDirectives={strategicDirectives}
          filteredDirectives={filteredDirectives}
          isCompact={isCompact}
        />

        {/* Sorting Panel Component */}
        <SDSortingPanel
          sortLevels={sortLevels}
          setSortLevels={setSortLevels}
          savedSorts={savedSorts}
          setSavedSorts={setSavedSorts}
          resetToStrategicPriority={resetToStrategicPriority}
          addSortLevel={addSortLevel}
          removeSortLevel={removeSortLevel}
          updateSortLevel={updateSortLevel}
          loadPreset={loadPreset}
          savePreset={savePreset}
          showSortingPanel={showSortingPanel}
          setShowSortingPanel={setShowSortingPanel}
          isCompact={isCompact}
        />
      </div>

      {/* List Component */}
      <SDList
        strategicDirectives={sortedDirectives}
        expandedSD={expandedSD}
        setExpandedSD={setExpandedSD}
        onUpdateChecklist={onUpdateChecklist}
        onSelectSD={setSelectedSD}
        copiedId={copiedId}
        setCopiedId={setCopiedId}
        currentSD={currentSD}
        onSetActiveSD={onSetActiveSD}
        onUpdateStatus={onUpdateStatus}
        onUpdatePriority={onUpdatePriority}
        isCompact={isCompact}
      />
    </div>
  );
}

export default SDManager;
