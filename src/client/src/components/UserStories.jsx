import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.ts';
import LoadingSkeleton from './LoadingSkeleton';
import SmartRefreshButton from './SmartRefreshButton';
import ProgressBar from './ui/ProgressBar';
import Toast from './ui/Toast';
import {
  BookOpen,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  ArrowRight,
  AlertTriangle,
  Filter,
  Hash,
  Link as LinkIcon,
  Search
} from 'lucide-react';

export default function UserStories({ strategicDirectives = [], prds = [], isCompact = false }) {
  const { sdKey } = useParams();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [groupedStories, setGroupedStories] = useState({});
  const [selectedSD, setSelectedSD] = useState(null);
  const [availableSDs, setAvailableSDs] = useState([]);
  const [gate, setGate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sdFilter, setSdFilter] = useState(sdKey || 'all');
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    prd: 'all'
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Mapping between abbreviated story keys and full SD keys
  const SD_KEY_MAPPING = {
    'SD-GOV-001': 'SD-GOVERNANCE-001',
    'SD-MON-001': 'SD-MONITORING-001',
    'SD-PIPE-001': 'SD-PIPELINE-001',
    'SD-VIS-001': 'SD-VISION-001',
    // Keep others as-is
    'SD-WSJF-001': 'SD-WSJF-001',
    'SD-2025-09-EMB': 'SD-2025-09-EMB',
    'SD-2025-PILOT-001': 'SD-2025-PILOT-001',
    'SD-PILOT-001': 'SD-PILOT-001',
    'SD-RABBIT-001': 'SD-RABBIT-001'
  };

  // Reverse mapping for finding stories
  const SD_KEY_REVERSE_MAPPING = Object.entries(SD_KEY_MAPPING).reduce((acc, [abbr, full]) => {
    acc[full] = abbr;
    return acc;
  }, {});

  useEffect(() => {
    loadStories();
  }, [sdKey, filters, searchQuery, sdFilter]);

  useEffect(() => {
    if (!sdKey) {
      loadAvailableSDs();
    }
  }, [sdKey]);

  useEffect(() => {
    // Update sdFilter when sdKey changes from URL
    if (sdKey && sdKey !== sdFilter) {
      setSdFilter(sdKey);
    }

    if (sdKey) {
      loadGateStatus();
      // Find the selected SD from the list or create a simple one
      const sd = strategicDirectives.find(s => s.id === sdKey || s.sd_key === sdKey) ||
                  availableSDs.find(s => s.sd_key === sdKey) ||
                  { id: sdKey, sd_key: sdKey, title: `Strategic Directive ${sdKey}` };
      setSelectedSD(sd);
    }
  }, [sdKey, strategicDirectives, availableSDs, sdFilter]);

  async function loadAvailableSDs() {
    try {
      // Get SDs that have stories by querying each known sd_key
      const sdsWithStories = [];
      const checkedKeys = new Set(); // Track what we've already checked

      // If we have strategicDirectives from props, use those
      if (strategicDirectives && strategicDirectives.length > 0) {
        for (const sd of strategicDirectives) {
          const sdKey = sd.sd_key || sd.sdKey || sd.id;
          const title = sd.title || `Strategic Directive ${sdKey}`;

          // Check both the full SD key and its abbreviated form (if exists)
          const keysToCheck = [sdKey];
          const abbreviatedKey = SD_KEY_REVERSE_MAPPING[sdKey];
          if (abbreviatedKey && abbreviatedKey !== sdKey) {
            keysToCheck.push(abbreviatedKey);
          }

          for (const keyToCheck of keysToCheck) {
            if (checkedKeys.has(keyToCheck)) continue;
            checkedKeys.add(keyToCheck);

            try {
              const response = await fetch(`/api/stories?sd_key=${keyToCheck}&limit=1`);
              const data = await response.json();

              if (response.ok && data.stories && data.stories.length > 0) {
                // Only add if we haven't already added this SD
                if (!sdsWithStories.some(s => s.sd_key === sdKey)) {
                  sdsWithStories.push({
                    sd_key: sdKey,
                    story_key: keyToCheck, // Track the actual key used for stories
                    title: title,
                    story_count: data.total || data.stories.length
                  });
                }
                break; // Found stories, no need to check other variations
              }
            } catch (e) {
              // Skip SDs that don't have stories
              continue;
            }
          }
        }
      } else {
        // Fallback: check all known story keys from database
        const knownStoryKeys = Object.keys(SD_KEY_MAPPING);

        for (const storyKey of knownStoryKeys) {
          if (checkedKeys.has(storyKey)) continue;
          checkedKeys.add(storyKey);

          try {
            const response = await fetch(`/api/stories?sd_key=${storyKey}&limit=1`);
            const data = await response.json();

            if (response.ok && data.stories && data.stories.length > 0) {
              const fullSDKey = SD_KEY_MAPPING[storyKey] || storyKey;
              // Find the SD title from strategic directives if available
              const sd = strategicDirectives.find(s =>
                s.sd_key === fullSDKey || s.sdKey === fullSDKey || s.id === fullSDKey
              );
              const title = sd?.title || `Strategic Directive ${fullSDKey}`;

              sdsWithStories.push({
                sd_key: fullSDKey,
                story_key: storyKey,
                title: title,
                story_count: data.total || data.stories.length
              });
            }
          } catch (e) {
            // Skip SDs that don't have stories
            continue;
          }
        }
      }

      setAvailableSDs(sdsWithStories);
      return sdsWithStories; // Return for immediate use
    } catch (error) {
      console.error('Failed to load available SDs:', error);
      return [];
    }
  }

  async function loadStories() {
    setLoading(true);
    try {
      let allStories = [];

      // Check if we should load all stories or specific SD stories
      if ((sdFilter === 'all' || !sdFilter) && !sdKey) {
        // Load stories from all available SDs
        let sdsToLoad = availableSDs;
        if (sdsToLoad.length === 0) {
          // If we don't have available SDs yet, try to load them first
          sdsToLoad = await loadAvailableSDs();
        }

        // Load stories from each SD
        for (const sd of sdsToLoad) {
          try {
            // Use the story_key if available (abbreviated form), otherwise use sd_key
            const keyToQuery = sd.story_key || sd.sd_key;
            const params = new URLSearchParams({
              sd_key: keyToQuery,
              limit: 100,
              offset: 0
            });

            if (filters.status !== 'all') {
              params.append('status', filters.status);
            }

            const response = await fetch(`/api/stories?${params}`);
            const data = await response.json();

            if (response.ok && data.stories) {
              // Add SD information to each story for context
              const storiesWithSD = data.stories.map(story => ({
                ...story,
                sd_key: sd.sd_key,
                sd_title: sd.title
              }));
              allStories.push(...storiesWithSD);
            }
          } catch (error) {
            console.warn(`Failed to load stories for ${sd.sd_key}:`, error);
          }
        }
      } else {
        // Load stories from specific SD
        const targetSdKey = sdKey || sdFilter;
        const params = new URLSearchParams({
          sd_key: targetSdKey,
          limit: 100,
          offset: 0
        });

        if (filters.status !== 'all') {
          params.append('status', filters.status);
        }

        const response = await fetch(`/api/stories?${params}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load stories');
        }

        allStories = data.stories || [];
      }

      // Apply client-side filtering
      let storiesData = applyClientFilters(allStories);

      setStories(storiesData);

      // Group stories by PRD
      const grouped = {};
      storiesData.forEach(story => {
        const prdId = story.parent_id || 'unassigned';
        if (!grouped[prdId]) {
          grouped[prdId] = {
            prd: prds.find(p => p.id === prdId),
            stories: []
          };
        }
        grouped[prdId].stories.push(story);
      });
      setGroupedStories(grouped);

    } catch (error) {
      console.error('Failed to load stories:', error);
      setToast({
        type: 'error',
        message: `Failed to load stories: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  }

  // Apply client-side filters (search, priority, PRD)
  function applyClientFilters(stories) {
    let filtered = [...stories];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(story =>
        story.story_key?.toLowerCase().includes(query) ||
        story.title?.toLowerCase().includes(query) ||
        story.description?.toLowerCase().includes(query) ||
        story.acceptance_criteria?.toLowerCase().includes(query) ||
        story.user_story?.toLowerCase().includes(query)
      );
    }

    // Priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(story =>
        story.priority?.toLowerCase() === filters.priority.toLowerCase()
      );
    }

    return filtered;
  }

  // Handle SD filter change
  function handleSDFilterChange(newSdKey) {
    setSdFilter(newSdKey);
    if (newSdKey === 'all') {
      // Navigate to main stories page
      navigate('/stories');
    } else {
      // Navigate to specific SD stories page
      navigate(`/stories/${newSdKey}`);
    }
  }

  async function loadGateStatus() {
    try {
      if (!sdKey) return;

      const response = await fetch(`/api/stories/gate?sd_key=${sdKey}`);
      const data = await response.json();

      if (response.ok) {
        setGate(data);
      } else {
        console.error('Failed to load gate status:', data.error);
      }
    } catch (error) {
      console.error('Failed to load gate status:', error);
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passing':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failing':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'not_run':
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getPriorityBadge = (priority) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[priority] || 'bg-gray-100 text-gray-800'}`}>
        {priority}
      </span>
    );
  };

  if (loading) {
    return <LoadingSkeleton count={5} />;
  }

  return (
    <div className={isCompact ? 'p-3' : 'p-6'}>
      <div className={isCompact ? 'mb-3' : 'mb-6'}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <BookOpen className={isCompact ? 'w-5 h-5 mr-2' : 'w-6 h-6 mr-3'} />
            <h1 className={isCompact ? 'text-xl font-semibold' : 'text-2xl font-bold'}>
              User Stories
            </h1>
            <span className={`ml-3 ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1 text-sm'} bg-gray-100 dark:bg-gray-700 rounded-full`}>
              {stories.length} {sdFilter === 'all' || !sdFilter ? 'total stories' : 'stories'}
            </span>
            {selectedSD && sdFilter !== 'all' && (
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                • {selectedSD.title}
              </span>
            )}
            {(sdFilter === 'all' || !sdFilter) && !sdKey && availableSDs.length > 0 && (
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                • Across {availableSDs.length} Strategic Directives
              </span>
            )}
          </div>
          <SmartRefreshButton onRefresh={loadStories} isCompact={isCompact} />
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
              placeholder="Search user stories..."
              className={`w-full ${isCompact ? 'pl-9 pr-3 py-1.5 text-sm' : 'pl-10 pr-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800`}
            />
          </div>

          {/* SD Filter */}
          <select
            value={sdFilter}
            onChange={(e) => handleSDFilterChange(e.target.value)}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Strategic Directives</option>
            {availableSDs.map(sd => (
              <option key={sd.sd_key} value={sd.sd_key}>
                {sd.title}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
          >
            <option value="all">All Status</option>
            <option value="passing">Passing</option>
            <option value="failing">Failing</option>
            <option value="not_run">Not Run</option>
          </select>

          {/* PRD Filter (only show if multiple PRDs) */}
          {Object.keys(groupedStories).length > 1 && (
            <select
              value={filters.prd}
              onChange={(e) => setFilters({ ...filters, prd: e.target.value })}
              className={`${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 bg-white dark:bg-gray-800`}
            >
              <option value="all">All PRDs</option>
              {Object.entries(groupedStories).map(([prdId, group]) => (
                <option key={prdId} value={prdId}>
                  {group.prd ? group.prd.title : 'Unassigned Stories'}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Hierarchy Breadcrumb */}
        <div className="bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20
                        rounded-lg p-4 mb-4 border border-primary-200 dark:border-primary-700">
          <div className="flex items-center text-sm">
            <div className="flex items-center">
              <FileText className="w-4 h-4 mr-2 text-primary-600" />
              <span className="font-medium">Strategic Directive</span>
            </div>
            <ArrowRight className="w-4 h-4 mx-3 text-gray-400" />
            <div className="flex items-center">
              <Hash className="w-4 h-4 mr-2 text-purple-600" />
              <span className="font-medium">PRDs</span>
            </div>
            <ArrowRight className="w-4 h-4 mx-3 text-gray-400" />
            <div className="flex items-center">
              <BookOpen className="w-4 h-4 mr-2 text-green-600" />
              <span className="font-medium">User Stories</span>
            </div>
          </div>
          {gate && (
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center">
                  <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                  {gate.passing_count} passing
                </span>
                <span className="flex items-center">
                  <XCircle className="w-4 h-4 mr-1 text-red-500" />
                  {gate.failing_count} failing
                </span>
                <span className="flex items-center">
                  <Clock className="w-4 h-4 mr-1 text-gray-400" />
                  {gate.not_run_count} not run
                </span>
              </div>
              <div className="flex items-center">
                {gate.ready ? (
                  <span className="flex items-center text-green-600 font-medium">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Release Ready ({Math.round((gate.passing_count / gate.total_stories) * 100)}%)
                  </span>
                ) : (
                  <span className="flex items-center text-yellow-600 font-medium">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Needs {Math.ceil(gate.total_stories * 0.8) - gate.passing_count} more passing stories
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Stories grouped by PRD - always show when stories exist */}
      {Object.keys(groupedStories).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedStories)
            .filter(([prdId]) => filters.prd === 'all' || filters.prd === prdId)
            .map(([prdId, group]) => (
              <div key={prdId} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Hash className="w-5 h-5 mr-2 text-purple-500" />
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {group.prd ? (
                          <Link
                            to={`/prds/${group.prd.id}`}
                            className="hover:text-primary-500 transition-colors"
                          >
                            {group.prd.title}
                          </Link>
                        ) : (
                          'Unassigned Stories'
                        )}
                      </h2>
                    </div>
                    <span className="text-sm text-gray-500">
                      {group.stories.length} stories
                    </span>
                  </div>
                  {group.prd && (
                    <div className="mt-2 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                      <span>Priority: {group.prd.priority}</span>
                      <span>Status: {group.prd.status}</span>
                      <Link
                        to={`/prds/${group.prd.id}`}
                        className="flex items-center text-primary-500 hover:text-primary-600"
                      >
                        <LinkIcon className="w-3 h-3 mr-1" />
                        View PRD
                      </Link>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {group.stories.map((story, idx) => (
                    <Link
                      key={story.backlog_id}
                      to={`/stories/${sdKey}/${story.story_key}`}
                      className="block p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center mb-2">
                            {getStatusIcon(story.verification_status)}
                            <h3 className="ml-2 font-medium text-gray-900 dark:text-white">
                              {story.story_title || story.backlog_title}
                            </h3>
                          </div>
                          {story.story_description && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              {story.story_description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">
                              {story.story_key}
                            </span>
                            {getPriorityBadge(story.priority)}
                            {story.coverage_pct && (
                              <span className="text-gray-500">
                                Coverage: {story.coverage_pct}%
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        // Empty state when no stories found
        !loading && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500 dark:text-gray-400 mb-2">
              No user stories found
            </p>
            <p className="text-sm text-gray-400">
              {sdFilter === 'all' || !sdFilter
                ? "User stories will appear here once PRDs are created and processed"
                : `No stories found for ${selectedSD?.title || 'this Strategic Directive'}`
              }
            </p>
          </div>
        )
      )}

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}