import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckSquare,
  Square,
  Calendar,
  User,
  Target,
  AlertCircle,
  Plus,
  Wand2,
  Filter,
  Archive,
  Activity,
  Search,
  Copy,
  TrendingUp,
  TrendingDown,
  Zap,
  Package,
  Edit3,
  X,
  Sparkles,
  Brain,
  RefreshCw,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Save,
  FolderOpen,
  RotateCcw,
  Trash2,
  GripVertical
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
// SDAssistant removed - using DirectiveLab instead
import SmartRefreshButton from './SmartRefreshButton';

function SDManager({ strategicDirectives, onUpdateChecklist, onSetActiveSD, currentSD, isCompact, detailMode, onRefresh, onUpdateStatus }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expandedSD, setExpandedSD] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detail'
  const [selectedSD, setSelectedSD] = useState(null);
  // SDAssistant state removed - using DirectiveLab navigation instead
  const [statusFilter, setStatusFilter] = useState(() => {
    // Check for migration flag and apply new defaults if needed
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      // First time with new defaults - apply them
      localStorage.setItem('sd-filter-migration-v2', 'true');
      localStorage.setItem('sd-status-filter', 'active,draft');
      localStorage.setItem('sd-priority-filter', 'critical,high');
      localStorage.setItem('sd-application-filter', 'EHG');
      return 'active,draft';
    }
    // Use saved preference after migration
    return localStorage.getItem('sd-status-filter') || 'active,draft';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState(() => {
    // Apply default if migration flag indicates new defaults should be used
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      return 'critical,high';
    }
    return localStorage.getItem('sd-priority-filter') || 'critical,high';
  });
  const [applicationFilter, setApplicationFilter] = useState(() => {
    // Apply default if migration flag indicates new defaults should be used
    const migrationFlag = localStorage.getItem('sd-filter-migration-v2');
    if (!migrationFlag) {
      return 'EHG';
    }
    return localStorage.getItem('sd-application-filter') || 'EHG';
  });
  const [copiedId, setCopiedId] = useState(null);

  // Collapsible metadata filter states
  const [showMetadataFilters, setShowMetadataFilters] = useState(false);

  // Sorting states
  const [showSortingPanel, setShowSortingPanel] = useState(false);
  const [sortLevels, setSortLevels] = useState(() => {
    const saved = localStorage.getItem('sd-sort-levels');
    return saved ? JSON.parse(saved) : [
      { field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }
    ];
  });
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
  const [sortPresetName, setSortPresetName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  // Owner filter removed as requested
  const [editingStatus, setEditingStatus] = useState(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(null);
  
  // Save filter preferences when they change - MUST be before any conditional returns
  useEffect(() => {
    localStorage.setItem('sd-status-filter', statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem('sd-priority-filter', priorityFilter);
  }, [priorityFilter]);

  useEffect(() => {
    localStorage.setItem('sd-application-filter', applicationFilter);
  }, [applicationFilter]);

  // Save sorting preferences when they change
  useEffect(() => {
    localStorage.setItem('sd-sort-levels', JSON.stringify(sortLevels));
  }, [sortLevels]);

  useEffect(() => {
    localStorage.setItem('sd-saved-sorts', JSON.stringify(savedSorts));
  }, [savedSorts]);

  // Handle URL-based detail view with navigation guards
  useEffect(() => {
    if (detailMode && id) {
      // Debug logging
      console.log('Detail mode - Looking for SD with id:', id);
      console.log('Available SDs count:', strategicDirectives.length);
      if (strategicDirectives.length > 0) {
        console.log('First few SDs:', strategicDirectives.slice(0, 3).map(d => ({ id: d.id, title: d.title })));
      }
      
      // Navigation guard: Check if SD exists
      const sd = strategicDirectives.find(d => d.id === id);
      if (sd) {
        console.log('Found SD:', sd.id, sd.title);
        setSelectedSD(sd);
        setViewMode('detail');
        // Update browser title
        document.title = `${sd.title || sd.id} - LEO Protocol Dashboard`;
      } else {
        // SD not found - only redirect if we've loaded the directives
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
      // Reset browser title
      document.title = 'Strategic Directives - LEO Protocol Dashboard';
    }
  }, [id, detailMode, strategicDirectives, navigate]);

  const toggleExpand = (sdId) => {
    setExpandedSD(expandedSD === sdId ? null : sdId);
  };
  
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };
  
  const clearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setApplicationFilter('all');
    setCategoryFilter('all');
  };

  const applyFilters = () => {
    // Close the filter section when "Done" is clicked
    setShowMetadataFilters(false);
  };

  const hasActiveFilters = searchQuery || priorityFilter !== 'all' || statusFilter !== 'all' || applicationFilter !== 'all' || categoryFilter !== 'all';
  
  const getPriorityBorderColor = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'critical': return 'border-l-4 border-l-red-500';
      case 'high': return 'border-l-4 border-l-orange-500';
      case 'medium': return 'border-l-4 border-l-yellow-500';
      case 'low': return 'border-l-4 border-l-gray-400';
      default: return 'border-l-4 border-l-gray-300';
    }
  };
  
  const getProgressBarGradient = (progress) => {
    if (progress === 100) return 'bg-gradient-to-r from-green-400 to-green-600 animate-pulse';
    if (progress >= 76) return 'bg-gradient-to-r from-blue-400 to-blue-600';
    if (progress >= 51) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
    if (progress >= 26) return 'bg-gradient-to-r from-orange-400 to-orange-600';
    return 'bg-gradient-to-r from-red-400 to-red-600';
  };

  const handleChecklistToggle = (documentId, itemIndex) => {
    const sd = strategicDirectives.find(d => d.id === documentId);
    if (sd && sd.checklist && sd.checklist[itemIndex]) {
      onUpdateChecklist(documentId, itemIndex, !sd.checklist[itemIndex].checked);
    }
  };

  const viewDetail = (sd) => {
    // Navigation guard: Validate SD before navigating
    if (!sd || !sd.id) {
      console.error('Invalid SD for navigation:', sd);
      return;
    }

    // Navigate to detail URL instead of just changing state
    try {
      navigate(`/strategic-directives/${sd.id}`);
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback: Stay on current page
    }
  };

  // State for AI backlog summaries
  const [backlogSummaries, setBacklogSummaries] = useState({});
  const [loadingSummaries, setLoadingSummaries] = useState(new Set());
  const [collapsedBacklogSections, setCollapsedBacklogSections] = useState(new Set());

  // Function to fetch AI-generated backlog summary
  const fetchBacklogSummary = async (sdId, forceRefresh = false) => {
    // Don't refetch if we have it and not forcing refresh
    if (!forceRefresh && backlogSummaries[sdId] && backlogSummaries[sdId].summary) {
      return; // Already loaded
    }

    if (loadingSummaries.has(sdId)) {
      return; // Currently loading
    }

    setLoadingSummaries(prev => new Set(prev).add(sdId));

    try {
      const url = `/api/strategic-directives/${sdId}/backlog-summary${forceRefresh ? '?force_refresh=true' : ''}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setBacklogSummaries(prev => ({
          ...prev,
          [sdId]: {
            ...data,
            timestamp: Date.now() // Track when we fetched it
          }
        }));
      } else {
        console.warn(`Failed to fetch backlog summary for ${sdId}:`, data.error);
        // Set fallback data
        setBacklogSummaries(prev => ({
          ...prev,
          [sdId]: {
            summary: data.fallback || 'Backlog summary unavailable.',
            itemCount: 0,
            cached: false
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching backlog summary:', error);
      setBacklogSummaries(prev => ({
        ...prev,
        [sdId]: {
          summary: 'Unable to load backlog summary.',
          itemCount: 0,
          cached: false
        }
      }));
    } finally {
      setLoadingSummaries(prev => {
        const newSet = new Set(prev);
        newSet.delete(sdId);
        return newSet;
      });
    }
  };

  if (viewMode === 'detail' && selectedSD) {
    return (
      <div className="p-6">
        <button
          onClick={() => navigate('/strategic-directives')}
          className="mb-4 text-primary-600 hover:text-primary-700 flex items-center"
        >
          <ChevronRight className="w-4 h-4 mr-1" />
          Back to List
        </button>
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {selectedSD.id}: {selectedSD.title || 'Untitled'}
          </h1>
          
          {/* Metadata */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {selectedSD.metadata && Object.entries(selectedSD.metadata).map(([key, value]) => (
              <div key={key} className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                <p className="text-xs text-gray-500 dark:text-gray-400">{key}</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Full Content - No Truncation */}
          <div className="prose prose-lg dark:prose-invert max-w-none mb-6">
            <ReactMarkdown>{selectedSD.content || 'No content available'}</ReactMarkdown>
          </div>

          {/* Interactive Checklist */}
          {selectedSD.checklist && selectedSD.checklist.length > 0 && (
            <div className="border-t pt-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Requirements Checklist</h3>
              <div className="space-y-2">
                {selectedSD.checklist.map((item, index) => (
                  <label
                    key={index}
                    className="flex items-start p-3 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleChecklistToggle(selectedSD.id, index)}
                      className="mt-1 mr-3 w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
                    />
                    <span className={`flex-1 ${item.checked ? 'line-through text-gray-500' : ''}`}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Associated PRDs */}
          {selectedSD.prds && selectedSD.prds.length > 0 && (
            <div className="border-t pt-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-600" />
                Product Requirements Documents ({selectedSD.prds.length})
              </h3>
              <div className="space-y-4">
                {selectedSD.prds.map((prd) => (
                  <div key={prd.id} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                          {prd.title}
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          ID: {prd.id}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          prd.status === 'approved' ? 'bg-green-100 text-green-800' :
                          prd.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {prd.status}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          prd.priority === 'high' ? 'bg-red-100 text-red-800' :
                          prd.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {prd.priority}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Phase:</strong> {prd.phase}
                        </p>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Progress:</strong> {prd.progress}%
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>Created:</strong> {new Date(prd.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                      <button
                        onClick={() => navigate(`/prds/${prd.id}`)}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium flex items-center"
                      >
                        View Full PRD <ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Associated EES Items */}
          {selectedSD.executionSequences && selectedSD.executionSequences.length > 0 && (
            <div className="border-t pt-6 mb-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Target className="w-5 h-5 mr-2 text-green-600" />
                Execution Sequence Steps ({selectedSD.executionSequences.length})
              </h3>
              <div className="space-y-3">
                {selectedSD.executionSequences.map((ees) => (
                  <div key={ees.id} className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          ees.status === 'completed' ? 'bg-green-500 text-white' :
                          ees.status === 'in_progress' ? 'bg-blue-500 text-white' :
                          'bg-gray-300 text-gray-600'
                        }`}>
                          {ees.sequenceNumber}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-green-900 dark:text-green-100">
                            {ees.description}
                          </p>
                          <div className="mt-2 flex items-center space-x-4 text-sm text-green-700 dark:text-green-300">
                            <span>
                              <strong>Executor:</strong> {ees.executorRole}
                            </span>
                            {ees.completedAt && (
                              <span>
                                <strong>Completed:</strong> {new Date(ees.completedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ees.status === 'completed' ? 'bg-green-100 text-green-800' :
                        ees.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ees.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If in detail mode but no selectedSD yet, show loading
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

  // Filter directives based on selected status, search query, and priority
  const filteredDirectives = strategicDirectives.filter(sd => {
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
          // Calculate WSJF score if not present
          if (aValue === undefined || aValue === null) {
            const aPriority = a.priority?.toLowerCase();
            aValue = aPriority === 'critical' ? 100 : aPriority === 'high' ? 75 : aPriority === 'medium' ? 50 : 25;
          }
          if (bValue === undefined || bValue === null) {
            const bPriority = b.priority?.toLowerCase();
            bValue = bPriority === 'critical' ? 100 : bPriority === 'high' ? 75 : bPriority === 'medium' ? 50 : 25;
          }
        } else if (level.field === 'id') {
          // Extract numeric part from SD-XXX format
          const aMatch = aValue?.match(/SD-(\d+)/);
          const bMatch = bValue?.match(/SD-(\d+)/);
          aValue = aMatch ? parseInt(aMatch[1], 10) : 999999;
          bValue = bMatch ? parseInt(bMatch[1], 10) : 999999;
        } else if (level.field === 'sequenceRank') {
          // Ensure numeric comparison for sequenceRank
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

  const sortedDirectives = performMultiLevelSort(filteredDirectives, sortLevels);


  const getStatusBadge = (status) => {
    const lowerStatus = status?.toLowerCase();

    if (lowerStatus === 'archived' || lowerStatus === 'completed' || lowerStatus === 'complete') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-105">
          <Package className="w-3 h-3 mr-1" />
          Archived
        </span>
      );
    } else if (lowerStatus === 'draft') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 transition-all duration-200 hover:scale-105">
          <Edit3 className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    } else if (lowerStatus === 'on_hold') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 transition-all duration-200 hover:scale-105">
          <AlertCircle className="w-3 h-3 mr-1" />
          On Hold
        </span>
      );
    } else if (lowerStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 transition-all duration-200 hover:scale-105">
          <X className="w-3 h-3 mr-1" />
          Cancelled
        </span>
      );
    }

    // Default to Active for anything else
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 transition-all duration-200 hover:scale-105">
        <Zap className="w-3 h-3 mr-1 animate-pulse" />
        Active
      </span>
    );
  };

  return (
    <div className={isCompact ? 'p-3' : 'p-6'}>
      {/* SDAssistant removed - now navigating to DirectiveLab */}
      
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
            
            {/* New Directive Button - Navigate to Directive Lab */}
            <button
              onClick={() => navigate('/directive-lab?mode=quick')}
              className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
            >
              <Wand2 className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
              New Directive
            </button>
          </div>
        </div>
        
        {/* Search Bar and Quick Filters */}
        <div className="mt-4 space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <input
              type="text"
              placeholder="Search by ID, title, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${isCompact ? 'pl-9 pr-3 py-1.5 text-sm' : 'pl-10 pr-4 py-2'} bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
              </button>
            )}
          </div>
          

          {/* Collapsible Filters */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <button
              onClick={() => setShowMetadataFilters(!showMetadataFilters)}
              className={`flex items-center gap-2 ${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200 w-full justify-between bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg`}
            >
              <div className="flex items-center gap-2">
                {showMetadataFilters ?
                  <ChevronDown className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} /> :
                  <ChevronRight className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                }
                <Filter className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                <span className="font-medium">Filters</span>
              </div>

              <div className="flex items-center">
                <span className={`${isCompact ? 'text-sm' : 'text-sm'} text-blue-600 dark:text-blue-400 font-medium`}>
                  {filteredDirectives.length} of {strategicDirectives.length}
                  {filteredDirectives.filter(sd => sd.rolled_triage).length > 0 && (
                    <span className="ml-1">
                      ({filteredDirectives.filter(sd => sd.rolled_triage === 'High').length}H /
                      {filteredDirectives.filter(sd => sd.rolled_triage === 'Medium').length}M /
                      {filteredDirectives.filter(sd => sd.rolled_triage === 'Low').length}L /
                      {filteredDirectives.filter(sd => sd.rolled_triage === 'Future').length}F)
                    </span>
                  )}
                </span>
              </div>
            </button>

            {showMetadataFilters && (
              <div className="mt-4 bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-800 dark:via-gray-750 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-lg transition-all duration-300 animate-in slide-in-from-top-2">
                {/* 2x2 Grid Layout for Filters */}
                <div className="grid grid-cols-2 gap-6 mb-6">
                  {/* Status Filter */}
                  <div className="group">
                    <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                    >
                      <option value="all">All Statuses</option>
                      <option value="active,draft">Active & Draft (Default)</option>
                      <option value="active">Active Only</option>
                      <option value="draft">Draft Only</option>
                      <option value="deferred">Deferred</option>
                      <option value="on_hold">On Hold</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="archived">Archived/Completed</option>
                    </select>
                  </div>

                  {/* Priority Filter */}
                  <div className="group">
                    <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                      Priority
                    </label>
                    <select
                      value={priorityFilter}
                      onChange={(e) => setPriorityFilter(e.target.value)}
                      className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                    >
                      <option value="all">All Priorities</option>
                      <option value="critical,high">Critical & High (Default)</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  {/* Application Filter */}
                  <div className="group">
                    <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                      Application
                    </label>
                    <select
                      value={applicationFilter}
                      onChange={(e) => setApplicationFilter(e.target.value)}
                      className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                    >
                      <option value="all">All Applications</option>
                      <option value="EHG">EHG (Default)</option>
                      <option value="EHG_ENGINEER">EHG Engineer</option>
                    </select>
                  </div>

                  {/* Category Filter */}
                  <div className="group">
                    <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                      Category
                    </label>
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                    >
                      <option value="all">All Categories</option>
                      {[...new Set(strategicDirectives.map(sd => sd.category).filter(Boolean))].map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2">
                    {hasActiveFilters && (
                      <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 flex items-center gap-1`}>
                        <Filter className="w-4 h-4" />
                        Filtering applied
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 flex items-center gap-2 font-medium border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500`}
                      >
                        <X className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                        Clear All
                      </button>
                    )}

                    <button
                      onClick={applyFilters}
                      className={`${isCompact ? 'px-4 py-1.5 text-xs' : 'px-6 py-2 text-sm'} bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg transition-all duration-200 flex items-center gap-2 font-medium shadow-md hover:shadow-lg transform hover:scale-105`}
                    >
                      <ChevronUp className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sorting Section - New Collapsible Panel */}
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
                        const preset = savedSorts[e.target.value];
                        if (preset) setSortLevels(preset);
                      }}
                      className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg`}
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
                        onChange={(e) => {
                          const newLevels = [...sortLevels];
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
                          newLevels[index] = { ...level, field: e.target.value, label: fieldLabels[e.target.value] || e.target.value };
                          setSortLevels(newLevels);
                        }}
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
                        onClick={() => {
                          const newLevels = [...sortLevels];
                          newLevels[index] = { ...level, direction: level.direction === 'asc' ? 'desc' : 'asc' };
                          setSortLevels(newLevels);
                        }}
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
                          onClick={() => {
                            setSortLevels(sortLevels.filter((_, i) => i !== index));
                          }}
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
                    onClick={() => {
                      setSortLevels([...sortLevels, { field: 'priority', direction: 'desc', label: 'Priority' }]);
                    }}
                    className={`mt-3 ${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-white dark:bg-gray-900 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 dark:hover:border-gray-500 w-full flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400`}
                  >
                    <Plus className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    Add Sort Level
                  </button>
                )}

                {/* Reset to Strategic Priority Sort Button */}
                <button
                  onClick={() => {
                    const strategicSort = [{ field: 'sequenceRank', direction: 'asc', label: 'Sequence Rank' }];
                    setSortLevels(strategicSort);
                    localStorage.setItem('sd-sort-levels', JSON.stringify(strategicSort));
                    // Reset saved sorts to defaults
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
                    localStorage.setItem('sd-saved-sorts', JSON.stringify(defaultSavedSorts));
                  }}
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
                          onClick={() => {
                            if (sortPresetName) {
                              setSavedSorts({ ...savedSorts, [sortPresetName]: sortLevels });
                              setShowSaveDialog(false);
                              setSortPresetName('');
                            }
                          }}
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
        </div>
      </div>

      {filteredDirectives.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {strategicDirectives.length === 0 
              ? 'No strategic directives found'
              : `No ${statusFilter === 'all' ? '' : statusFilter} directives found`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDirectives.map((sd) => (
            <div
              key={sd.id}
              className={`group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${getPriorityBorderColor(sd.priority)}`}
            >
              <div className={`${isCompact ? 'p-3' : 'p-6'} relative`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <button
                        onClick={() => toggleExpand(sd.id)}
                        className="mr-2 p-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/20 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 transform hover:scale-105"
                        aria-label={expandedSD === sd.id ? 'Collapse' : 'Expand'}
                      >
                        <ChevronRight 
                          className={`w-4 h-4 transition-transform duration-200 ease-in-out ${
                            expandedSD === sd.id ? 'rotate-90' : ''
                          }`} 
                        />
                      </button>
                      <div className="space-y-2">
                        {/* SD ID and sequence rank */}
                        <div className="flex items-center">
                          <span className="inline-flex items-center group">
                            <span className="text-primary-600 dark:text-primary-400 font-mono text-lg font-bold">{sd.id}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(sd.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded ml-2"
                              title="Copy ID"
                            >
                              {copiedId === sd.id ? (
                                <CheckSquare className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-gray-500" />
                              )}
                            </button>
                          </span>
                        </div>

                        {/* SD Title on separate line */}
                        <h2 className={`${isCompact ? 'text-base' : 'text-xl'} font-semibold text-gray-900 dark:text-white ${isCompact ? 'line-clamp-2' : ''}`}>
                          {sd.title || 'Untitled'}
                        </h2>
                      </div>
                    </div>



                    {/* Enhanced Progress Bar */}
                    <div className={`${isCompact ? 'mt-2' : 'mt-4'}`}>
                      <div className="flex justify-between items-center mb-1">
                        <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 flex items-center`}>
                          Progress
                          {sd.progressTrend && (
                            sd.progressTrend > 0 ? 
                              <TrendingUp className="w-3 h-3 ml-1 text-green-500" /> :
                              <TrendingDown className="w-3 h-3 ml-1 text-red-500" />
                          )}
                        </span>
                        <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold flex items-center`}>
                          {sd.progress}%
                          {sd.progress === 100 && <Sparkles className="w-3 h-3 ml-1 text-green-500 animate-pulse" />}
                        </span>
                      </div>
                      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${isCompact ? 'h-2' : 'h-3'} shadow-inner`}>
                        <div
                          className={`${isCompact ? 'h-2' : 'h-3'} rounded-full transition-all duration-1000 ease-out ${getProgressBarGradient(sd.progress)}`}
                          style={{ 
                            width: `${sd.progress}%`,
                            boxShadow: sd.progress === 100 ? '0 0 10px rgba(34, 197, 94, 0.5)' : 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`${isCompact ? 'ml-2' : 'ml-4'} flex flex-col items-end ${isCompact ? 'space-y-1' : 'space-y-2'}`}>

                    <div className={`flex ${isCompact ? 'space-x-1' : 'space-x-2'}`}>
                      {currentSD === sd.id ? (
                        <button
                          disabled
                          className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-green-500 text-white rounded flex items-center`}
                        >
                          <Target className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
                          {isCompact ? '✓ Working' : '✓ Working On'}
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetActiveSD && onSetActiveSD(sd.id)}
                          className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg flex items-center`}
                        >
                          <Target className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} ${isCompact ? '' : 'mr-1'} animate-pulse`} />
                          {isCompact ? 'Work On' : 'Work On This'}
                        </button>
                      )}
                    </div>

                    {/* Metadata Badges - MOVED HERE with neutral colors */}
                    <div className={`${isCompact ? 'mt-2 gap-1' : 'mt-3 gap-2'} flex flex-wrap items-end justify-end`}>
                      {/* Status badge with edit capability */}
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setStatusDropdownOpen(statusDropdownOpen === sd.id ? null : sd.id);
                          }}
                          className="group flex items-center gap-1 hover:opacity-80 transition-opacity"
                        >
                          {getStatusBadge(sd.status)}
                          <Edit3 className="w-3 h-3 text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                        </button>

                        {statusDropdownOpen === sd.id && (
                          <div className="absolute left-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                            <div className="py-1">
                              {['active', 'draft', 'on_hold', 'cancelled', 'archived'].map(status => (
                                <button
                                  key={status}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onUpdateStatus) {
                                      onUpdateStatus(sd.id, status);
                                    }
                                    setStatusDropdownOpen(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                                    sd.status === status ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600' : 'text-gray-700 dark:text-gray-200'
                                  }`}
                                >
                                  <span className="capitalize">{status}</span>
                                  {sd.status === status && <CheckSquare className="w-3 h-3" />}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Target Application badge with neutral colors */}
                      {sd.targetApplication && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                          {sd.targetApplication.replace('_', ' ')}
                        </span>
                      )}

                      {/* View Backlog with neutral colors */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/backlog?sd=${sd.sd_id || sd.id}`);
                        }}
                        className={`flex items-center ${isCompact ? 'px-2 py-0.5 text-xs' : 'px-2 py-1 text-xs'} transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded`}
                        title={`${sd.total_backlog_items || sd.total_items || sd.backlog_count || 0} backlog items`}
                      >
                        <Package className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                        <span className="ml-1 text-xs">
                          {sd.total_backlog_items || sd.total_items || sd.backlog_count || 0}
                        </span>
                      </button>

                      {/* Priority with neutral colors */}
                      {(sd.priority || sd.rolled_triage) && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                          {isCompact ?
                            (sd.priority?.[0]?.toUpperCase() || sd.rolled_triage?.[0]) :
                            `${sd.priority || sd.rolled_triage}`
                          }
                        </span>
                      )}

                      {/* Category with neutral colors */}
                      {sd.category && (
                        <span className={`px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded`}>
                          {sd.category}
                        </span>
                      )}
                    </div>



                    {sd.checklist && sd.checklist.length > 0 && (
                      <div className="text-sm text-gray-600">
                        <span className="flex items-center">
                          <CheckSquare className="w-4 h-4 mr-1" />
                          {sd.checklist.filter(item => item.checked).length}/{sd.checklist.length}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI-Generated Backlog Summary - Full width below flex container */}
                {sd.hasBacklogItems && (
                  <div className={`${isCompact ? 'mt-3' : 'mt-4'} pt-3 border-t border-gray-200 dark:border-gray-700`}>
                    <div className="flex items-center justify-between mb-2">
                      <button
                        onClick={() => {
                          setCollapsedBacklogSections(prev => {
                            const next = new Set(prev);
                            if (next.has(sd.id)) {
                              next.delete(sd.id);
                            } else {
                              next.add(sd.id);
                            }
                            return next;
                          });
                        }}
                        className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 flex items-center hover:text-purple-600 dark:hover:text-purple-400 transition-colors`}
                      >
                        {collapsedBacklogSections.has(sd.id) ? (
                          <ChevronRight className="w-4 h-4 mr-1" />
                        ) : (
                          <ChevronDown className="w-4 h-4 mr-1" />
                        )}
                        <Brain className="w-4 h-4 mr-1" />
                        Backlog Overview
                      </button>
                      <div className="flex items-center gap-2">
                        {backlogSummaries[sd.id] && !collapsedBacklogSections.has(sd.id) && (
                          <button
                            onClick={() => fetchBacklogSummary(sd.id, true)}
                            disabled={loadingSummaries.has(sd.id)}
                            className={`p-1 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors ${loadingSummaries.has(sd.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="Refresh summary"
                          >
                            <RefreshCw className={`w-4 h-4 ${loadingSummaries.has(sd.id) ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <span className={`${isCompact ? 'text-xs' : 'text-sm'} bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-1 rounded-full`}>
                          {sd.backlogItemCount}
                        </span>
                      </div>
                    </div>

                    {!collapsedBacklogSections.has(sd.id) && (
                      <>
                        {backlogSummaries[sd.id] ? (
                          <div className="space-y-2">
                            <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 leading-relaxed`}>
                              {backlogSummaries[sd.id].summary}
                            </div>
                            {/* Show when summary was generated and if it's from database */}
                            {(backlogSummaries[sd.id].generated_at || backlogSummaries[sd.id].from_database) && (
                              <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                                  {backlogSummaries[sd.id].from_database && (
                                    <>
                                      <Database className="w-3 h-3 mr-1" />
                                      Stored in database
                                    </>
                                  )}
                                  {backlogSummaries[sd.id].generated_at && (
                                    <span className="ml-2">
                                      Generated: {new Date(backlogSummaries[sd.id].generated_at).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            <div className={`flex items-center space-x-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                              <span className="text-red-600 dark:text-red-400">🔥 {sd.h_count} High</span>
                              <span className="text-orange-600 dark:text-orange-400">📋 {sd.m_count} Medium</span>
                              <span className="text-blue-600 dark:text-blue-400">📝 {sd.l_count} Low</span>
                              <span className="text-gray-600 dark:text-gray-400">🔮 {sd.future_count} Future</span>
                            </div>
                            {backlogSummaries[sd.id].generated_at && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                                Generated: {new Date(backlogSummaries[sd.id].generated_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {loadingSummaries.has(sd.id) ? (
                              <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 flex items-center`}>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-500 mr-2"></div>
                                Generating AI summary...
                              </div>
                            ) : (
                              <button
                                onClick={() => fetchBacklogSummary(sd.id)}
                                className={`inline-flex items-center ${isCompact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/30 text-purple-800 dark:text-purple-300 rounded transition-colors`}
                              >
                                <Brain className="w-3 h-3 mr-1" />
                                Generate AI Summary
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Expanded Content */}
                {expandedSD === sd.id && (
                  <div className="mt-6 border-t pt-6">
                    {/* Consolidated Backlog Summary - Details available in compact badge above */}
                    {(sd.h_count > 0 || sd.m_count > 0 || sd.l_count > 0 || sd.future_count > 0) && (
                      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                            <FileText className="w-4 h-4 mr-2 text-blue-600" />
                            Backlog Details
                          </span>
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            H: {sd.h_count || 0} • M: {sd.m_count || 0} • L: {sd.l_count || 0}
                            {sd.future_count > 0 && ` • Future: ${sd.future_count}`}
                            {sd.must_have_count > 0 && ` • Must-have: ${sd.must_have_count}`}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* Checklist Preview */}
                    {sd.checklist && sd.checklist.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-lg font-semibold mb-3 flex items-center">
                          <Target className="w-5 h-5 mr-2" />
                          Requirements Checklist
                        </h3>
                        <div className="space-y-2">
                          {sd.checklist.slice(0, 5).map((item, index) => (
                            <label
                              key={index}
                              className="flex items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={() => handleChecklistToggle(sd.id, index)}
                                className="mr-3 w-4 h-4 text-primary-600 rounded"
                              />
                              <span className={`${item.checked ? 'line-through text-gray-500' : ''}`}>
                                {item.text}
                              </span>
                            </label>
                          ))}
                          {sd.checklist && sd.checklist.length > 5 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              +{sd.checklist.length - 5} more items
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Content Preview */}
                    <div className="prose dark:prose-invert max-w-none">
                      <h3 className="text-lg font-semibold mb-3">Content Preview</h3>
                      <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded max-h-64 overflow-y-auto">
                        <ReactMarkdown>
                          {sd.content.substring(0, 500) + (sd.content.length > 500 ? '...' : '')}
                        </ReactMarkdown>
                      </div>
                      <span className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                        Full content available in detail view
                      </span>
                    </div>
                  </div>
                )}

                {/* Consolidated Action Bar - Clear hierarchy for secondary actions */}
                {expandedSD === sd.id && (
                  <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex flex-wrap gap-2 justify-between items-center">
                      {/* Secondary Actions */}
                      <div className="flex flex-wrap gap-2">
                        {/* User Stories Action */}
                        {sd.storyCount > 0 ? (
                          <Link
                            to={`/stories/${sd.sdKey}`}
                            className="inline-flex items-center px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
                          >
                            📚 View {sd.storyCount} Stories
                          </Link>
                        ) : (
                          <button
                            onClick={() => generateStoriesForSD(sd.sdKey)}
                            className="inline-flex items-center px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-all duration-200"
                          >
                            ✨ Generate Stories
                          </button>
                        )}

                        {/* Checklist Action */}
                        {sd.checklist && sd.checklist.length > 0 && (
                          <button
                            onClick={() => viewDetail(sd)}
                            className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200"
                          >
                            ✅ View All {sd.checklist.length} Tasks
                          </button>
                        )}

                        {/* Content Action */}
                        <button
                          onClick={() => viewDetail(sd)}
                          className="inline-flex items-center px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200"
                        >
                          📄 Full Document
                        </button>
                      </div>

                      {/* Tertiary Action */}
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Updated {new Date(sd.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SDManager;