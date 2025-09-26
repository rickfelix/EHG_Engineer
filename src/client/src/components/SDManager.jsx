import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckSquare,
  GripVertical,
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
  Edit2,
  X,
  Sparkles,
  MessageSquare,
  Loader2
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
    // Load filter preference from localStorage, default to 'active_draft'
    return localStorage.getItem('sd-status-filter') || 'active_draft';
  });
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [targetAppFilter, setTargetAppFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);
  const [editingStatus, setEditingStatus] = useState(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(null);
  const [reorderingId, setReorderingId] = useState(null);

  // Backlog summary state
  const [backlogSummaries, setBacklogSummaries] = useState({});
  const [expandedSummaries, setExpandedSummaries] = useState({});
  const [loadingSummaries, setLoadingSummaries] = useState({});
  
  // Save filter preference when it changes - MUST be before any conditional returns
  useEffect(() => {
    localStorage.setItem('sd-status-filter', statusFilter);
  }, [statusFilter]);
  
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

  // Fetch backlog summary for an SD
  const fetchBacklogSummary = async (sdId) => {
    if (backlogSummaries[sdId] || loadingSummaries[sdId]) {
      return; // Already have it or currently loading
    }

    setLoadingSummaries(prev => ({ ...prev, [sdId]: true }));

    try {
      const response = await fetch(`/api/strategic-directives/${sdId}/backlog-summary`);
      const data = await response.json();

      if (response.ok) {
        setBacklogSummaries(prev => ({
          ...prev,
          [sdId]: data
        }));
      } else {
        console.error('Failed to fetch backlog summary:', data.error);
      }
    } catch (error) {
      console.error('Error fetching backlog summary:', error);
    } finally {
      setLoadingSummaries(prev => ({ ...prev, [sdId]: false }));
    }
  };

  // Toggle backlog summary expansion
  const toggleSummaryExpansion = (sdId) => {
    const isExpanded = expandedSummaries[sdId];

    if (isExpanded) {
      setExpandedSummaries(prev => ({ ...prev, [sdId]: false }));
    } else {
      setExpandedSummaries(prev => ({ ...prev, [sdId]: true }));
      // Fetch summary when expanding if not already available
      fetchBacklogSummary(sdId);
    }
  };
  
  const clearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setTargetAppFilter('all');
  };

  const hasActiveFilters = searchQuery || priorityFilter !== 'all' || statusFilter !== 'all' || targetAppFilter !== 'all';
  
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

  const handleReorder = async (sdId, direction) => {
    setReorderingId(sdId);

    try {
      const response = await fetch(`/api/strategic-directives/${sdId}/reorder`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ direction })
      });

      if (!response.ok) {
        throw new Error('Failed to reorder');
      }

      // Refresh the directives list to get updated order
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('Error reordering strategic directive:', error);
    } finally {
      setReorderingId(null);
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
          {/* SD Code */}
          <div className="text-primary-600 dark:text-primary-400 font-mono text-lg font-semibold mb-2">
            {selectedSD.id}
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {selectedSD.title || 'Untitled'}
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
    // Status filter
    let statusMatch = true;
    if (statusFilter !== 'all') {
      if (statusFilter === 'active_draft') {
        statusMatch = sd.status?.toLowerCase() === 'active' || sd.status?.toLowerCase() === 'draft';
      } else if (statusFilter === 'active') {
        statusMatch = sd.status?.toLowerCase() === 'active';
      } else if (statusFilter === 'draft') {
        statusMatch = sd.status?.toLowerCase() === 'draft';
      } else if (statusFilter === 'superseded') {
        statusMatch = sd.status?.toLowerCase() === 'superseded';
      } else if (statusFilter === 'completed') {
        statusMatch = sd.status?.toLowerCase() === 'completed';
      }
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
    
    // Priority filter
    let priorityMatch = true;
    if (priorityFilter !== 'all') {
      priorityMatch = sd.priority?.toLowerCase() === priorityFilter.toLowerCase();
    }

    // Target Application filter
    let targetAppMatch = true;
    if (targetAppFilter !== 'all') {
      if (targetAppFilter === 'ehg_engineer') {
        targetAppMatch = sd.target_application === 'EHG_ENGINEER';
      } else if (targetAppFilter === 'ehg') {
        targetAppMatch = sd.target_application === 'EHG' || !sd.target_application;
      }
    }

    return statusMatch && searchMatch && priorityMatch && targetAppMatch;
  });
  
  // Sort directives by execution_order (set by WSJF scoring)
  const sortedDirectives = [...filteredDirectives].sort((a, b) => {
    // Primary sort by execution_order if it exists
    if (a.execution_order !== undefined && b.execution_order !== undefined) {
      return a.execution_order - b.execution_order;
    }
    // If only one has execution_order, put it first
    if (a.execution_order !== undefined) return -1;
    if (b.execution_order !== undefined) return 1;

    // Secondary sort by sequence_rank if it exists
    if (a.sequence_rank !== undefined && b.sequence_rank !== undefined) {
      return a.sequence_rank - b.sequence_rank;
    }
    if (a.sequence_rank !== undefined) return -1;
    if (b.sequence_rank !== undefined) return 1;

    // Tertiary fallback to ID-based sorting
    const getNumericId = (id) => {
      if (!id) return 999999;
      const match = id.match(/SD-(\d+)/);
      return match ? parseInt(match[1], 10) : 999999;
    };

    const aNum = getNumericId(a.id);
    const bNum = getNumericId(b.id);

    return aNum - bNum;
  });

  const getFilterLabel = () => {
    switch (statusFilter) {
      case 'active_draft': return 'Active & Draft';
      case 'active': return 'Active Only';
      case 'draft': return 'Draft Only';
      case 'superseded': return 'Superseded Only';
      case 'completed': return 'Completed Only';
      case 'all': return 'All Directives';
      default: return 'Active & Draft';
    }
  };

  const getStatusBadge = (status) => {
    if (status?.toLowerCase() === 'completed') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-700 dark:text-green-300 transition-all duration-200 hover:scale-105">
          <CheckSquare className="w-3 h-3 mr-1" />
          Completed
        </span>
      );
    } else if (status?.toLowerCase() === 'draft') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 transition-all duration-200 hover:scale-105">
          <Edit3 className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    } else if (status?.toLowerCase() === 'superseded') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 transition-all duration-200 hover:scale-105">
          <Archive className="w-3 h-3 mr-1" />
          Superseded
        </span>
      );
    }
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
      
      <div className="space-y-4 mb-6">
        {/* Page Header Section */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary-500 animate-pulse" />
              <h1 className={`${isCompact ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white`}>
                Strategic Directives
              </h1>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>
                Showing {filteredDirectives.length} of {strategicDirectives.length} directives
              </span>
              {filteredDirectives.filter(sd => sd.rolled_triage).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                  <span className="font-medium">
                    {filteredDirectives.filter(sd => sd.rolled_triage === 'High').length}H /
                    {filteredDirectives.filter(sd => sd.rolled_triage === 'Medium').length}M /
                    {filteredDirectives.filter(sd => sd.rolled_triage === 'Low').length}L /
                    {filteredDirectives.filter(sd => sd.rolled_triage === 'Future').length}F
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SmartRefreshButton onRefresh={onRefresh} className={isCompact ? 'p-1.5' : 'p-2'} />
            <button
              onClick={() => navigate('/directive-lab')}
              className={`flex items-center gap-2 ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
            >
              <Plus className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
              New Directive
            </button>
          </div>
        </div>

        {/* Status Bar Section */}
        <div className="w-full">
          {(() => {
            const currentSDData = strategicDirectives.find(sd => sd.id === currentSD);
            const isCurrentSDCompleted = currentSDData?.status?.toLowerCase() === 'completed';

            if (currentSD && !isCurrentSDCompleted) {
              // Show active work status (purple)
              return (
                <div className="w-full p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg flex items-center transition-all duration-200">
                  <Zap className="w-4 h-4 mr-2 text-purple-600 dark:text-purple-400 animate-pulse" />
                  <span className="text-purple-700 dark:text-purple-300 font-medium">
                    Currently Working On: {currentSDData?.title || currentSD}
                  </span>
                </div>
              );
            } else {
              // Show "select new directive" status (green)
              return (
                <div className="w-full p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg flex items-center transition-all duration-200">
                  <Target className="w-4 h-4 mr-2 text-green-600 dark:text-green-400" />
                  <span className="text-green-700 dark:text-green-300 font-medium">
                    Select a new strategic directive to work on
                  </span>
                </div>
              );
            }
          })()}
        </div>

        {/* Search and Filter Controls Section */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
          {/* Search Input - Full width on mobile, flex-1 on desktop */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search strategic directives..."
              className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filter Controls Group */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className={`flex items-center gap-2 ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors`}
              >
                <Filter className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
                {getFilterLabel()}
                <ChevronDown className={`${isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
              </button>

              {showFilterDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setStatusFilter('active_draft');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'active_draft' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <Activity className="w-4 h-4 mr-2" />
                        Active & Draft
                      </span>
                      {statusFilter === 'active_draft' && <CheckSquare className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setStatusFilter('all');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'all' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <FileText className="w-4 h-4 mr-2" />
                        All Directives
                      </span>
                      {statusFilter === 'all' && <CheckSquare className="w-4 h-4" />}
                    </button>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    <button
                      onClick={() => {
                        setStatusFilter('active');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'active' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <Activity className="w-4 h-4 mr-2" />
                        Active Only
                      </span>
                      {statusFilter === 'active' && <CheckSquare className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setStatusFilter('draft');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'draft' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <Edit3 className="w-4 h-4 mr-2" />
                        Draft Only
                      </span>
                      {statusFilter === 'draft' && <CheckSquare className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setStatusFilter('superseded');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'superseded' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <Archive className="w-4 h-4 mr-2" />
                        Superseded Only
                      </span>
                      {statusFilter === 'superseded' && <CheckSquare className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => {
                        setStatusFilter('completed');
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                        statusFilter === 'completed' ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      <span className="flex items-center">
                        <CheckSquare className="w-4 h-4 mr-2" />
                        Completed Only
                      </span>
                      {statusFilter === 'completed' && <CheckSquare className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Priority Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400">Priority:</span>
              {['all', 'critical', 'high', 'medium', 'low'].map((priority) => (
                <button
                  key={priority}
                  onClick={() => setPriorityFilter(priority)}
                  className={`px-2 py-1 text-xs rounded-full transition-all duration-200 ${
                    priorityFilter === priority
                      ? priority === 'critical' ? 'bg-red-500 text-white' :
                        priority === 'high' ? 'bg-orange-500 text-white' :
                        priority === 'medium' ? 'bg-yellow-500 text-white' :
                        priority === 'low' ? 'bg-gray-500 text-white' :
                        'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </button>
              ))}
            </div>

            {/* Target Application Filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-600 dark:text-gray-400">Target:</span>
              {[
                { value: 'all', label: 'All', icon: '📱' },
                { value: 'ehg_engineer', label: 'EHG_Engineer', icon: '🛠️' },
                { value: 'ehg', label: 'EHG', icon: '🚀' }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTargetAppFilter(option.value)}
                  className={`px-2 py-1 text-xs rounded-full transition-all duration-200 flex items-center gap-1 ${
                    targetAppFilter === option.value
                      ? option.value === 'ehg_engineer'
                        ? 'bg-purple-500 text-white'
                        : option.value === 'ehg'
                        ? 'bg-blue-500 text-white'
                        : 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                  title={
                    option.value === 'ehg_engineer'
                      ? 'LEO Protocol development platform'
                      : option.value === 'ehg'
                      ? 'Business application features'
                      : 'Show all strategic directives'
                  }
                >
                  <span>{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-3 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-200 flex items-center gap-1"
              >
                <X className="w-3 h-3" />
                Clear Filters
              </button>
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
              className={`bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${getPriorityBorderColor(sd.priority)}`}
            >
              <div className={`${isCompact ? 'p-3' : 'p-6'} relative group`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      {/* Reorder Control Zone - Enhanced Visibility */}
                      <div className="flex items-center mr-3">
                        {/* Grip Handle */}
                        <div className="text-gray-400 dark:text-gray-500 mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-grab active:cursor-grabbing">
                          <GripVertical className="w-5 h-5" />
                        </div>

                        {/* Reorder Buttons - Always Visible with Enhanced Styling */}
                        <div className="flex flex-col gap-1 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg p-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReorder(sd.id, 'up');
                            }}
                            disabled={sortedDirectives.indexOf(sd) === 0 || reorderingId === sd.id}
                            className={`p-2 rounded-md transition-all duration-200 ${
                              sortedDirectives.indexOf(sd) === 0 || reorderingId === sd.id
                                ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800'
                                : 'bg-white dark:bg-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:shadow-md border border-transparent hover:border-primary-200 dark:hover:border-primary-700'
                            }`}
                            aria-label="Move up in priority"
                            title="Move up"
                          >
                            <ChevronUp className={`w-5 h-5 ${
                              sortedDirectives.indexOf(sd) === 0 || reorderingId === sd.id
                                ? 'text-gray-400 dark:text-gray-600'
                                : 'text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400'
                            }`} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReorder(sd.id, 'down');
                            }}
                            disabled={sortedDirectives.indexOf(sd) === sortedDirectives.length - 1 || reorderingId === sd.id}
                            className={`p-2 rounded-md transition-all duration-200 ${
                              sortedDirectives.indexOf(sd) === sortedDirectives.length - 1 || reorderingId === sd.id
                                ? 'opacity-40 cursor-not-allowed bg-gray-100 dark:bg-gray-800'
                                : 'bg-white dark:bg-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:shadow-md border border-transparent hover:border-primary-200 dark:hover:border-primary-700'
                            }`}
                            aria-label="Move down in priority"
                            title="Move down"
                          >
                            <ChevronDown className={`w-5 h-5 ${
                              sortedDirectives.indexOf(sd) === sortedDirectives.length - 1 || reorderingId === sd.id
                                ? 'text-gray-400 dark:text-gray-600'
                                : 'text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400'
                            }`} />
                          </button>
                        </div>
                      </div>

                      {/* Expand Button */}
                      <button
                        onClick={() => toggleExpand(sd.id)}
                        className="mr-3 p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/20 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 transform hover:scale-110"
                        aria-label={expandedSD === sd.id ? 'Collapse details' : 'Expand details'}
                      >
                        <ChevronRight
                          className={`w-5 h-5 transition-transform duration-200 ease-in-out ${
                            expandedSD === sd.id ? 'rotate-90' : ''
                          }`}
                        />
                      </button>

                      {/* Title Section */}
                      <div className="flex-1">
                        {/* SD Code Line */}
                        <div className="flex items-center mb-1">
                          {/* Execution Order Badge - Enhanced */}
                          {sd.execution_order && (
                            <span className="inline-flex items-center mr-2">
                              <span className="text-sm font-bold px-2.5 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-md shadow-md" title={`Execution order (WSJF Score: ${sd.metadata?.wsjf_score || 'N/A'})`}>
                                #{sd.execution_order}
                              </span>
                            </span>
                          )}

                          {/* Loading state during reorder */}
                          {reorderingId === sd.id && (
                            <span className="inline-flex items-center mr-2">
                              <span className="px-2.5 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-md text-sm font-medium animate-pulse shadow-sm">
                                <Loader2 className="w-4 h-4 inline mr-1 animate-spin" />
                                Updating...
                              </span>
                            </span>
                          )}
                          <span className="inline-flex items-center group">
                            <span className="text-primary-600 dark:text-primary-400 font-mono text-sm font-semibold">{sd.id}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(sd.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded ml-1"
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

                        {/* Title Line */}
                        <h2 className={`${isCompact ? 'text-base' : 'text-xl'} font-semibold text-gray-900 dark:text-white ${isCompact ? 'line-clamp-1' : ''}`}>
                          {sd.title || 'Untitled'}
                        </h2>
                      </div>
                    </div>
                    
                    {/* Keep only metadata badges on left side - all other attributes moved to right */}
                    {(sd.metadata?.Owner || sd.metadata?.Date) && (
                      <div className={`${isCompact ? 'mt-2 gap-1' : 'mt-3 gap-2'} flex flex-wrap items-center`}>
                        {sd.metadata.Owner && (
                          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded flex items-center">
                            <User className="w-3 h-3 mr-1" />
                            {sd.metadata.Owner}
                          </span>
                        )}
                        {sd.metadata.Date && (
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded flex items-center">
                            <Calendar className="w-3 h-3 mr-1" />
                            {sd.metadata.Date}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Backlog Summary Section */}
                    {sd.total_items && sd.total_items > 0 && (
                      <div className={`${isCompact ? 'mt-2' : 'mt-3'} border-t border-gray-200 dark:border-gray-700 pt-3`}>
                        <button
                          onClick={() => toggleSummaryExpansion(sd.id)}
                          className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors duration-200"
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          {expandedSummaries[sd.id] ? 'Hide' : 'Show'} backlog summary
                          {loadingSummaries[sd.id] && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                        </button>

                        {expandedSummaries[sd.id] && (
                          <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                            {loadingSummaries[sd.id] ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                                <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">Generating AI summary...</span>
                              </div>
                            ) : backlogSummaries[sd.id] ? (
                              <div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                  {backlogSummaries[sd.id].summary}
                                </p>
                                <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>Based on {backlogSummaries[sd.id].item_count} backlog items</span>
                                  <span className="flex items-center">
                                    {backlogSummaries[sd.id].ai_generated ? (
                                      <>🤖 AI Generated</>
                                    ) : (
                                      <>📝 Text Summary</>
                                    )}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                                Failed to load summary. Please try again.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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
                          {typeof sd.progress === 'object' ? sd.progress.total : sd.progress}%
                          {(typeof sd.progress === 'object' ? sd.progress.total : sd.progress) === 100 && <Sparkles className="w-3 h-3 ml-1 text-green-500 animate-pulse" />}
                        </span>
                      </div>
                      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${isCompact ? 'h-2' : 'h-3'} shadow-inner`}>
                        <div
                          className={`${isCompact ? 'h-2' : 'h-3'} rounded-full transition-all duration-1000 ease-out ${getProgressBarGradient(typeof sd.progress === 'object' ? sd.progress.total : sd.progress)}`}
                          style={{
                            width: `${typeof sd.progress === 'object' ? sd.progress.total : sd.progress}%`,
                            boxShadow: (typeof sd.progress === 'object' ? sd.progress.total : sd.progress) === 100 ? '0 0 10px rgba(34, 197, 94, 0.5)' : 'none'
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className={`${isCompact ? 'ml-2' : 'ml-4'} flex flex-col items-end ${isCompact ? 'space-y-1' : 'space-y-2'}`}>
                    {/* Action Buttons */}
                    <div className={`flex ${isCompact ? 'space-x-1' : 'space-x-2'}`}>
                      <button
                        onClick={() => viewDetail(sd)}
                        className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg`}
                      >
                        {isCompact ? 'View' : 'View Full'}
                      </button>
                      {currentSD === sd.id && sd.status?.toLowerCase() !== 'completed' ? (
                        <button
                          disabled
                          className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-purple-600 text-white rounded flex items-center`}
                          title="This is the SD currently being worked on"
                        >
                          <Zap className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
                          {isCompact ? '⚡' : 'Working On'}
                        </button>
                      ) : sd.status?.toLowerCase() === 'completed' ? (
                        <button
                          disabled
                          className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-green-400 text-green-800 rounded flex items-center cursor-not-allowed`}
                          title="Cannot set completed directives as active"
                        >
                          <CheckSquare className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} ${isCompact ? '' : 'mr-1'}`} />
                          {!isCompact && 'Completed'}
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetActiveSD && onSetActiveSD(sd.id)}
                          className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg flex items-center`}
                          title="Select this SD to work on"
                        >
                          <Zap className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} ${isCompact ? '' : 'mr-1'} animate-pulse`} />
                          {!isCompact && 'Start Work'}
                        </button>
                      )}
                    </div>

                    {/* Attributes Grid - Moved from left side */}
                    <div className={`${isCompact ? 'mt-2' : 'mt-3'} grid ${isCompact ? 'grid-cols-2 gap-1' : 'grid-cols-2 gap-2'} w-full`}>
                      {/* Target Application Badge */}
                      {sd.target_application && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded text-center ${
                          sd.target_application === 'EHG_Engineer'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {isCompact ? (sd.target_application === 'EHG_Engineer' ? 'Eng' : 'EHG') : sd.target_application}
                        </span>
                      )}

                      {/* Status Badge with Edit */}
                      <div className="flex items-center justify-center">
                        {editingStatus === sd.id ? (
                          <select
                            value={sd.status}
                            onChange={(e) => handleStatusChange(sd, e.target.value)}
                            onBlur={() => setEditingStatus(null)}
                            className={`${isCompact ? 'text-xs px-1 py-0.5' : 'text-sm px-2 py-1'} rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="draft">Draft</option>
                            <option value="active">Active</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="archived">Archived</option>
                          </select>
                        ) : (
                          <div
                            className="flex items-center cursor-pointer group"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingStatus(sd.id);
                            }}
                          >
                            {getStatusBadge(sd.status)}
                            <Edit2 className={`${isCompact ? 'w-2 h-2' : 'w-3 h-3'} ml-1 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300`} />
                          </div>
                        )}
                      </div>

                      {/* Category */}
                      {sd.category && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 rounded text-center`}>
                          {isCompact && sd.category.length > 8 ? sd.category.substring(0, 8) + '...' : sd.category}
                        </span>
                      )}

                      {/* Priority/Metadata Priority */}
                      {(sd.priority || sd.metadata?.Priority) && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} rounded text-center ${
                          (sd.priority || sd.metadata?.Priority) === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          (sd.priority || sd.metadata?.Priority) === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {isCompact ? (sd.priority || sd.metadata?.Priority)[0] : (sd.priority || sd.metadata?.Priority)}
                        </span>
                      )}

                      {/* View Backlog button - moved from left side */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/backlog?sd=${sd.sd_id || sd.id}`);
                        }}
                        className={`col-span-2 flex items-center justify-center ${isCompact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${
                          (sd.total_backlog_items > 0 || sd.total_items > 0 || sd.backlog_count > 0)
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800/40'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                        } rounded transition-colors`}
                      >
                        <Package className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
                        Backlog
                        <span className={`ml-1 ${isCompact ? 'px-1' : 'px-1.5'} py-0.5 ${
                          (sd.total_backlog_items > 0 || sd.total_items > 0 || sd.backlog_count > 0)
                            ? 'bg-indigo-200 dark:bg-indigo-800'
                            : 'bg-gray-200 dark:bg-gray-600'
                        } rounded text-xs font-bold`}>
                          {sd.total_backlog_items || sd.total_items || sd.backlog_count || 0}
                        </span>
                      </button>

                      {/* Rolled Triage */}
                      {sd.rolled_triage && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded text-center ${
                          sd.rolled_triage === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          sd.rolled_triage === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          sd.rolled_triage === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {isCompact ? sd.rolled_triage[0] : `Triage: ${sd.rolled_triage}`}
                        </span>
                      )}

                      {/* Must-Have Percentage */}
                      {sd.must_have_pct !== null && sd.must_have_pct !== undefined && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'} text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded text-center`}>
                          {sd.must_have_pct}%{!isCompact && ' Must-Have'}
                        </span>
                      )}

                      {/* Checklist Progress */}
                      {sd.checklist && sd.checklist.length > 0 && (
                        <div className="col-span-2 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-center">
                          <CheckSquare className="w-4 h-4 mr-1" />
                          {sd.checklist.filter(item => item.checked).length}/{sd.checklist.length}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedSD === sd.id && (
                  <div className="mt-6 border-t pt-6">
                    {/* Backlog Items Summary */}
                    {(sd.h_count > 0 || sd.m_count > 0 || sd.l_count > 0 || sd.future_count > 0) && (
                      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <h3 className="text-lg font-semibold mb-3 flex items-center">
                          <FileText className="w-5 h-5 mr-2 text-blue-600" />
                          Backlog Items Summary
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {sd.h_count > 0 && (
                            <div className="text-center p-2 bg-red-100 dark:bg-red-900/20 rounded">
                              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{sd.h_count}</p>
                              <p className="text-xs text-red-600 dark:text-red-300">High Priority</p>
                            </div>
                          )}
                          {sd.m_count > 0 && (
                            <div className="text-center p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded">
                              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{sd.m_count}</p>
                              <p className="text-xs text-yellow-600 dark:text-yellow-300">Medium Priority</p>
                            </div>
                          )}
                          {sd.l_count > 0 && (
                            <div className="text-center p-2 bg-green-100 dark:bg-green-900/20 rounded">
                              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{sd.l_count}</p>
                              <p className="text-xs text-green-600 dark:text-green-300">Low Priority</p>
                            </div>
                          )}
                          {sd.future_count > 0 && (
                            <div className="text-center p-2 bg-gray-100 dark:bg-gray-600 rounded">
                              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{sd.future_count}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">Future</p>
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Total backlog items: {(sd.h_count || 0) + (sd.m_count || 0) + (sd.l_count || 0) + (sd.future_count || 0)}
                          {sd.must_have_count > 0 && ` • Must-have: ${sd.must_have_count}`}
                        </p>
                        <button
                          onClick={() => viewDetail(sd)}
                          className="mt-3 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
                        >
                          View all backlog items →
                        </button>
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
                            <button
                              onClick={() => viewDetail(sd)}
                              className="text-primary-600 hover:text-primary-700 text-sm"
                            >
                              View all {sd.checklist.length} items...
                            </button>
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
                      <button
                        onClick={() => viewDetail(sd)}
                        className="mt-3 text-primary-600 hover:text-primary-700"
                      >
                        Read full document →
                      </button>
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