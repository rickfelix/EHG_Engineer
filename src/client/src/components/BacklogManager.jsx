import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
  Package, 
  ChevronDown, 
  ChevronRight, 
  Filter,
  Search,
  Plus,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Hash,
  FileText,
  Calendar,
  Flag,
  Layers,
  MessageSquare,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';
import SmartRefreshButton from './SmartRefreshButton';

function BacklogManager({ backlogData = [], strategicDirectives = [], isCompact, onRefresh }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const preFilteredSD = urlParams.get('sd');
  
  const [expandedItems, setExpandedItems] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sdFilter, setSdFilter] = useState(preFilteredSD || 'all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [newModuleFilter, setNewModuleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [backlog, setBacklog] = useState([]);
  const [groupedBacklog, setGroupedBacklog] = useState({});

  // Load backlog data
  useEffect(() => {
    const loadBacklog = async () => {
      setLoading(true);
      try {
        const url = sdFilter && sdFilter !== 'all' 
          ? `/api/backlog/strategic-directives/${sdFilter}`
          : '/api/backlog/strategic-directives-with-items';
          
        const response = await fetch(url);
        const data = await response.json();
        
        if (sdFilter && sdFilter !== 'all') {
          // Single SD with its backlog items
          setBacklog(data.backlog_items || []);
          setGroupedBacklog({
            [data.sd_id]: {
              sd: data,
              items: data.backlog_items || []
            }
          });
        } else {
          // Multiple SDs - optimized endpoint returns all data at once
          const grouped = {};
          data.forEach(sd => {
            grouped[sd.sd_id] = {
              sd: sd,
              items: sd.backlog_items || []
            };
          });
          setGroupedBacklog(grouped);
          
          // Flatten all items for search/filter
          const allItems = data.flatMap(sd => sd.backlog_items || []);
          setBacklog(allItems);
        }
      } catch (error) {
        console.error('Error loading backlog:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBacklog();
  }, [sdFilter]);

  // Apply filters
  const filteredGroups = Object.entries(groupedBacklog).reduce((acc, [sdId, group]) => {
    let filteredItems = group.items;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filteredItems = filteredItems.filter(item =>
        item.backlog_title?.toLowerCase().includes(query) ||
        item.item_description?.toLowerCase().includes(query) ||
        item.backlog_id?.toLowerCase().includes(query) ||
        item.my_comments?.toLowerCase().includes(query)
      );
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      filteredItems = filteredItems.filter(item => 
        item.priority?.toLowerCase() === priorityFilter.toLowerCase()
      );
    }

    // New Module filter
    if (newModuleFilter === 'yes') {
      filteredItems = filteredItems.filter(item => item.new_module === true);
    } else if (newModuleFilter === 'no') {
      filteredItems = filteredItems.filter(item => item.new_module === false);
    }

    if (filteredItems.length > 0) {
      acc[sdId] = {
        ...group,
        items: filteredItems
      };
    }

    return acc;
  }, {});

  const getPriorityBadge = (priority) => {
    if (!priority) return null;
    
    const p = priority.toLowerCase();
    const config = {
      high: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', icon: TrendingUp },
      h: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-400', icon: TrendingUp },
      medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', icon: TrendingDown },
      m: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-800 dark:text-yellow-400', icon: TrendingDown },
      low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', icon: TrendingDown },
      l: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-400', icon: TrendingDown },
      future: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-300', icon: Clock }
    };
    
    const style = config[p] || config.low;
    const Icon = style.icon;
    
    return (
      <span className={`inline-flex items-center ${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded ${style.bg} ${style.text}`}>
        <Icon className={`${isCompact ? 'w-3 h-3' : 'w-3 h-3'} mr-1`} />
        {priority}
      </span>
    );
  };

  const toggleItemExpansion = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading backlog...</div>
      </div>
    );
  }

  const totalItems = Object.values(filteredGroups).reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className={isCompact ? 'p-3' : 'p-6'}>
      <div className={isCompact ? 'mb-3' : 'mb-6'}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Package className={isCompact ? 'w-5 h-5 mr-2' : 'w-6 h-6 mr-3'} />
            <h1 className={isCompact ? 'text-xl font-semibold' : 'text-2xl font-bold'}>
              Backlog Management
            </h1>
            <span className={`ml-3 ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-gray-100 dark:bg-gray-700 rounded-full`}>
              {totalItems} items
            </span>
          </div>
          <SmartRefreshButton onRefresh={onRefresh} isCompact={isCompact} />
        </div>

        {/* Filters */}
        <div className={`flex flex-wrap gap-2 ${isCompact ? 'mb-3' : 'mb-4'}`}>
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-400`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search backlog items..."
              className={`w-full ${isCompact ? 'pl-9 pr-3 py-1.5 text-sm' : 'pl-10 pr-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800`}
            />
          </div>

          {/* SD Filter */}
          <select
            value={sdFilter}
            onChange={(e) => setSdFilter(e.target.value)}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Strategic Directives</option>
            {Object.values(groupedBacklog).map(({ sd }) => (
              <option key={sd.sd_id} value={sd.sd_id}>
                {sd.sd_title}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="future">Future</option>
          </select>

          {/* New Module Filter */}
          <select
            value={newModuleFilter}
            onChange={(e) => setNewModuleFilter(e.target.value)}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Items</option>
            <option value="yes">New Module</option>
            <option value="no">Existing Module</option>
          </select>

          {/* Add New Backlog Item Button */}
          <button
            onClick={() => navigate('/backlog/new')}
            className={`flex items-center ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
          >
            <Plus className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} mr-2`} />
            New Backlog Item
          </button>
        </div>
      </div>

      {/* Backlog Groups */}
      <div className="space-y-4">
        {Object.entries(filteredGroups).map(([sdId, { sd, items }]) => (
          <div key={sdId} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {/* SD Header */}
            <div className={`${isCompact ? 'p-3' : 'p-4'} border-b border-gray-200 dark:border-gray-700`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h2 className={`${isCompact ? 'text-base' : 'text-lg'} font-semibold text-gray-900 dark:text-white`}>
                    {sd.sd_title}
                  </h2>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {sd.sd_id}
                    </span>
                    {sd.rolled_triage && (
                      <span className={`text-xs px-2 py-1 rounded ${
                        sd.rolled_triage === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        sd.rolled_triage === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                        sd.rolled_triage === 'Low' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        Triage: {sd.rolled_triage}
                      </span>
                    )}
                    {sd.must_have_pct !== null && (
                      <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                        {sd.must_have_pct}% Must-Have
                      </span>
                    )}
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 rounded">
                      {items.length} items
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/strategic-directives/${sd.sd_id}`)}
                  className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <FileText className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                </button>
              </div>
            </div>

            {/* Backlog Items */}
            <div className={isCompact ? 'p-2' : 'p-3'}>
              {items.length === 0 ? (
                <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                  No backlog items found
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={`${sdId}-${item.backlog_id}`}
                      className="border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div
                        className={`${isCompact ? 'p-2' : 'p-3'} cursor-pointer`}
                        onClick={() => toggleItemExpansion(`${sdId}-${item.backlog_id}`)}
                        onKeyDown={(e) => handleKeyDown(e, () => toggleItemExpansion(`${sdId}-${item.backlog_id}`))}
                        tabIndex="0"
                        role="button"
                        aria-expanded={expandedItems[`${sdId}-${item.backlog_id}`] || false}
                        aria-label={`Toggle details for ${item.backlog_title}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start flex-1">
                            <div className="mr-2 mt-1">
                              {expandedItems[`${sdId}-${item.backlog_id}`] ? (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                  {item.backlog_id}
                                </span>
                                <span className={`${isCompact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white`}>
                                  {item.backlog_title}
                                </span>
                                {item.new_module && (
                                  <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 rounded">
                                    New Module
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {getPriorityBadge(item.priority)}
                            {item.stage_number && (
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded">
                                Stage {item.stage_number}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedItems[`${sdId}-${item.backlog_id}`] && (
                          <div className={`mt-3 ${isCompact ? 'pl-5' : 'pl-6'} space-y-2`}>
                            {item.item_description && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Description</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">{item.item_description}</div>
                              </div>
                            )}
                            {item.my_comments && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Comments</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">{item.my_comments}</div>
                              </div>
                            )}
                            {item.phase && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Phase</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">{item.phase}</div>
                              </div>
                            )}
                            {item.description_raw && (
                              <div>
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tags</div>
                                <div className="text-sm text-gray-700 dark:text-gray-300">{item.description_raw}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(filteredGroups).length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No backlog items found matching your filters</p>
        </div>
      )}
    </div>
  );
}

export default BacklogManager;