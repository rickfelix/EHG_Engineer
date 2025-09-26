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
  Sparkles
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

  const generateStoriesForSD = async (sdKey) => {
    try {
      // TODO: Implement story generation API call
      console.log('Generating stories for SD:', sdKey);
      // This would call the OpenAI story generation endpoint
      // For now, navigate to the stories page where generation can happen
      navigate(`/stories/${sdKey}`);
    } catch (error) {
      console.error('Error generating stories:', error);
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
  
  // Sort directives by sequence_rank first, then by ID
  const sortedDirectives = [...filteredDirectives].sort((a, b) => {
    // First sort by sequence_rank if it exists (lower numbers first)
    if (a.sequence_rank !== undefined && b.sequence_rank !== undefined) {
      return a.sequence_rank - b.sequence_rank;
    }
    // If only one has sequence_rank, put it first
    if (a.sequence_rank !== undefined) return -1;
    if (b.sequence_rank !== undefined) return 1;
    
    // Fallback to ID-based sorting for SDs without sequence_rank
    const getNumericId = (id) => {
      if (!id) return 999999;
      const match = id.match(/SD-(\d+)/);
      return match ? parseInt(match[1], 10) : 999999;
    };
    
    const aNum = getNumericId(a.id);
    const bNum = getNumericId(b.id);
    
    return aNum - bNum;
  });


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
                          {sd.sequence_rank && (
                            <span className="text-xs font-medium px-1.5 py-0.5 mr-2 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-400 rounded">
                              #{sd.sequence_rank}
                            </span>
                          )}
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
                    
                    <div className={`${isCompact ? 'mt-2 gap-1' : 'mt-3 gap-2'} flex flex-wrap items-center`}>
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

                      {/* Target Application badge */}
                      {sd.targetApplication && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded ${
                          sd.targetApplication === 'EHG_ENGINEER'
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400'
                            : sd.targetApplication === 'EHG'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {sd.targetApplication.replace('_', ' ')}
                        </span>
                      )}

                      {/* View Backlog button - always show, indicate count if available */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/backlog?sd=${sd.sd_id || sd.id}`);
                        }}
                        className={`flex items-center ${isCompact ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${
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
                      
                      {/* Show rolled triage from import */}
                      {sd.rolled_triage && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded ${
                          sd.rolled_triage === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                          sd.rolled_triage === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                          sd.rolled_triage === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {isCompact ? sd.rolled_triage[0] : `Triage: ${sd.rolled_triage}`}
                        </span>
                      )}
                      
                      {/* Show must-have percentage */}
                      {sd.must_have_pct !== null && (
                        <span className={`${isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'} text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded`}>
                          {sd.must_have_pct}%{!isCompact && ' Must-Have'}
                        </span>
                      )}
                      
                      {/* Show category */}
                      {sd.category && !isCompact && (
                        <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 rounded">
                          {sd.category}
                        </span>
                      )}
                      
                      {sd.metadata.Status && sd.metadata.Status !== sd.status && (
                        <span className={`px-2 py-1 text-xs rounded ${
                          sd.metadata.Status === 'Completed' ? 'bg-green-100 text-green-800' :
                          sd.metadata.Status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {sd.metadata.Status}
                        </span>
                      )}
                      {sd.metadata.Priority && (
                        <span className={`px-2 py-1 text-xs rounded ${
                          sd.metadata.Priority === 'High' ? 'bg-red-100 text-red-800' :
                          sd.metadata.Priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {sd.metadata.Priority}
                        </span>
                      )}
                      {sd.metadata.Owner && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded flex items-center">
                          <User className="w-3 h-3 mr-1" />
                          {sd.metadata.Owner}
                        </span>
                      )}
                      {sd.metadata.Date && (
                        <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {sd.metadata.Date}
                        </span>
                      )}
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
                      <button
                        onClick={() => viewDetail(sd)}
                        className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg`}
                      >
                        {isCompact ? 'View' : 'View Full'}
                      </button>
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

                    {/* Metadata display */}
                    {sd.metadata && (
                      <div className={`${isCompact ? 'mt-2' : 'mt-3'} space-y-1`}>
                        <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 font-medium`}>
                          Metadata
                        </div>
                        <div className="space-y-1">
                          {Object.entries(sd.metadata).map(([key, value]) => (
                            value && (
                              <div key={key} className={`flex ${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400`}>
                                <span className="font-medium mr-2 min-w-[80px]">{key}:</span>
                                <span className="break-all">{value}</span>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* User Stories Summary */}
                    {sd.storySummary && (
                      <div className={`${isCompact ? 'mt-2' : 'mt-3'} pt-3 border-t border-gray-200 dark:border-gray-700`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 flex items-center`}>
                            📚 User Stories
                          </span>
                          <span className={`${isCompact ? 'text-xs' : 'text-sm'} bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full`}>
                            {sd.storyCount}
                          </span>
                        </div>

                        {sd.storyCount > 0 ? (
                          <div className="space-y-2">
                            <div className={`flex items-center space-x-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                              <span className="text-green-600 dark:text-green-400">✅ {sd.storySummary.statusBreakdown.passing}</span>
                              <span className="text-red-600 dark:text-red-400">❌ {sd.storySummary.statusBreakdown.failing}</span>
                              <span className="text-gray-600 dark:text-gray-400">⏸️ {sd.storySummary.statusBreakdown.not_run}</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div
                                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${sd.storySummary.passingPct || 0}%` }}
                              ></div>
                            </div>
                            <Link
                              to={`/stories/${sd.sdKey}`}
                              className={`inline-flex items-center ${isCompact ? 'text-xs' : 'text-sm'} text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300`}
                            >
                              View Stories →
                            </Link>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400`}>No stories yet</p>
                            <button
                              onClick={() => generateStoriesForSD(sd.sdKey)}
                              className={`inline-flex items-center ${isCompact ? 'text-xs' : 'text-sm'} text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300`}
                            >
                              + Generate Stories
                            </button>
                          </div>
                        )}
                      </div>
                    )}

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