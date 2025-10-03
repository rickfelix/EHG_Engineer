import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  PlayCircle,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Download,
  RefreshCw,
  Activity,
  TrendingUp,
  Shield,
  Bug,
  FileText,
  Users,
  Zap,
  Plus,
  Edit3,
  Trash2,
  ChevronDown,
  Filter
} from 'lucide-react';
import { TestExecutionModal } from './TestExecutionModal';
import { CreateTestCaseModal } from './CreateTestCaseModal';
import { EditTestCaseModal } from './EditTestCaseModal';
import { SDGenerationModal } from './SDGenerationModal';
import { UAT_SECTIONS, getAllSections, getSectionLabel } from '../../config/uat-sections';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function UATDashboard() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [runStats, setRunStats] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [activeTestId, setActiveTestId] = useState(null);
  const [modalTestCase, setModalTestCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Filter states - Default to Critical, Not Tested, Manual
  const [priorityFilter, setPriorityFilter] = useState('critical');
  const [statusFilter, setStatusFilter] = useState('not_tested');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [testTypeFilter, setTestTypeFilter] = useState('manual');
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTestCase, setEditTestCase] = useState(null);
  const [sdModalTestCase, setSdModalTestCase] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Fetch all runs on mount and test cases
  useEffect(() => {
    fetchRuns();
    fetchTestCases(); // Always fetch test cases

    // Auto-refresh every 5 minutes
    const refreshInterval = setInterval(() => {
      handleRefresh();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Fetch run details when selected
  useEffect(() => {
    if (selectedRun) {
      fetchRunDetails(selectedRun);
      // Set up real-time subscription
      const subscription = subscribeToUpdates(selectedRun);
      return () => subscription.unsubscribe();
    }
  }, [selectedRun]);

  const fetchRuns = async () => {
    const { data, error } = await supabase
      .from('uat_runs')
      .select('*')
      .order('started_at', { ascending: false });

    if (!error && data) {
      setRuns(data);
      if (data.length > 0 && !selectedRun) {
        setSelectedRun(data[0].id);
      }
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRuns();
    if (selectedRun) {
      await fetchRunDetails(selectedRun);
    }
  };

  const fetchRunDetails = async (runId) => {
    // Fetch stats
    const { data: stats } = await supabase
      .from('v_uat_run_stats')
      .select('*')
      .eq('run_id', runId)
      .single();

    setRunStats(stats);
    setActiveTestId(stats?.active_case_id || null);

    // Results no longer needed - removed for cleaner UI

    // Update test case status for this run
    await updateTestCaseStatus(runId);
  };

  const fetchTestCases = async () => {
    // Fetch all test cases in logical order (by sort_order, then section)
    const { data: caseData } = await supabase
      .from('uat_cases')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('section')
      .order('priority', { ascending: false });

    setTestCases(caseData || []);
  };

  const updateTestCaseStatus = async (runId) => {
    if (!runId) return;

    // Get results for mapping status
    const { data: allResults } = await supabase
      .from('uat_results')
      .select('case_id, status')
      .eq('run_id', runId);

    const resultMap = new Map(allResults?.map(r => [r.case_id, r.status]) || []);

    setTestCases(prev => prev.map(c => ({
      ...c,
      status: resultMap.get(c.id) || null
    })));
  };

  const openTestModal = async (testCase) => {
    let runId = selectedRun;

    // If no run exists, create one
    if (!runId) {
      const { data: newRun, error } = await supabase
        .from('uat_runs')
        .insert({
          app: 'EHG',
          env_url: 'http://localhost:5173',
          app_version: '1.0.0',
          browser: 'Chrome',
          role: 'Admin',
          notes: 'UAT testing session',
          started_at: new Date().toISOString(),
          created_by: 'UAT Dashboard'
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to create run:', error);
        return;
      }

      runId = newRun.id;
      setSelectedRun(runId);
      setRuns(prev => [newRun, ...prev]);
    }

    // Try to set active test in database, but don't block on failure
    // The RPC function may not exist, so we handle it gracefully
    try {
      // Update directly instead of using RPC
      await supabase
        .from('uat_runs')
        .update({ active_case_id: testCase.id })
        .eq('id', runId);

      setActiveTestId(testCase.id);
    } catch (error) {
      console.warn('Could not set active test in database:', error);
      // Still set locally
      setActiveTestId(testCase.id);
    }

    // Always open the modal with the test case
    setModalTestCase({ ...testCase, runId });
  };

  const handleTestComplete = (status) => {
    // Update test case status in the list
    setTestCases(prev => prev.map(tc =>
      tc.id === modalTestCase.id
        ? { ...tc, status }
        : tc
    ));

    // Close modal but keep test active so user can reopen if needed
    setModalTestCase(null);

    // Refresh run details
    if (selectedRun) {
      fetchRunDetails(selectedRun);
    }
  };

  const handleModalClose = () => {
    // Just close the modal, don't clear active test
    // This allows user to reopen the modal for the same test
    setModalTestCase(null);
  };

  const handleTestCaseCreated = (newTestCase) => {
    // Refresh test cases after creation
    fetchTestCases();
    setCreateModalOpen(false);
  };

  const handleTestCaseUpdated = (updatedTestCase) => {
    // Refresh test cases after update
    fetchTestCases();
    setEditTestCase(null);
  };

  const handleTestCaseDeleted = (testCaseId) => {
    // Remove test case from local state immediately
    setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));
    setEditTestCase(null);
  };

  const subscribeToUpdates = (runId) => {
    return supabase
      .channel(`uat-${runId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'uat_results',
        filter: `run_id=eq.${runId}`
      }, () => {
        fetchRunDetails(runId);
      })
      .subscribe();
  };

  const getGateColor = (status) => {
    switch (status) {
      case 'GREEN': return '#10b981';
      case 'YELLOW': return '#f59e0b';
      case 'RED': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getBadgeClass = (variant) => {
    switch (variant) {
      case 'success': return 'bg-green-100 text-green-800';
      case 'warning': return 'bg-yellow-100 text-yellow-800';
      case 'destructive': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PASS': return '✓';
      case 'FAIL': return '✗';
      case 'BLOCKED': return '⚠';
      case 'NA': return '○';
      default: return '?';
    }
  };

  // Filter test cases based on current filters
  const filteredTestCases = testCases.filter(test => {
    // Priority filter
    if (priorityFilter !== 'all' && test.priority !== priorityFilter) return false;

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'not_tested' && test.status) return false;
      if (statusFilter !== 'not_tested' && test.status !== statusFilter) return false;
    }

    // Section filter (case-insensitive comparison)
    if (sectionFilter !== 'all') {
      const testSection = (test.section || '').toLowerCase();
      const filterSection = sectionFilter.toLowerCase();
      if (testSection !== filterSection) return false;
    }

    // Test type filter
    if (testTypeFilter !== 'all' && test.test_type !== testTypeFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!test.id.toLowerCase().includes(query) &&
          !test.title.toLowerCase().includes(query) &&
          !(test.section || '').toLowerCase().includes(query)) {
        return false;
      }
    }

    return true;
  });

  // Count statistics for filters
  const statusCounts = {
    all: testCases.length,
    PASS: testCases.filter(t => t.status === 'PASS').length,
    FAIL: testCases.filter(t => t.status === 'FAIL').length,
    BLOCKED: testCases.filter(t => t.status === 'BLOCKED').length,
    NA: testCases.filter(t => t.status === 'NA').length,
    not_tested: testCases.filter(t => !t.status).length
  };

  const priorityCounts = {
    all: testCases.length,
    critical: testCases.filter(t => t.priority === 'critical').length,
    high: testCases.filter(t => t.priority === 'high').length,
    medium: testCases.filter(t => t.priority === 'medium').length,
    low: testCases.filter(t => t.priority === 'low').length
  };

  // Helper function to get count for a section based on current filters
  const getSectionCount = (section) => {
    return testCases.filter(test => {
      // Apply all filters except section filter
      if (priorityFilter !== 'all' && test.priority !== priorityFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'not_tested' && test.status) return false;
        if (statusFilter !== 'not_tested' && test.status !== statusFilter) return false;
      }
      if (testTypeFilter !== 'all' && test.test_type !== testTypeFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!test.id.toLowerCase().includes(query) &&
            !test.title.toLowerCase().includes(query) &&
            !(test.section || '').toLowerCase().includes(query)) {
          return false;
        }
      }
      // Check section (case-insensitive)
      if (section === 'all') return true;
      const testSection = (test.section || '').toLowerCase();
      const filterSection = section.toLowerCase();
      return testSection === filterSection;
    }).length;
  };

  // Helper function to get count for test type based on current filters
  const getTestTypeCount = (type) => {
    return testCases.filter(test => {
      // Apply all filters except test type filter
      if (priorityFilter !== 'all' && test.priority !== priorityFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'not_tested' && test.status) return false;
        if (statusFilter !== 'not_tested' && test.status !== statusFilter) return false;
      }
      // Section filter (case-insensitive)
      if (sectionFilter !== 'all') {
        const testSection = (test.section || '').toLowerCase();
        const filterSection = sectionFilter.toLowerCase();
        if (testSection !== filterSection) return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!test.id.toLowerCase().includes(query) &&
            !test.title.toLowerCase().includes(query) &&
            !(test.section || '').toLowerCase().includes(query)) {
          return false;
        }
      }
      // Check test type
      if (type === 'all') return true;
      if (type === 'automatic') return test.test_type === 'automatic' || !test.test_type;
      if (type === 'manual') return test.test_type === 'manual';
      return false;
    }).length;
  };

  const clearFilters = () => {
    setPriorityFilter('all');
    setStatusFilter('all');
    setSectionFilter('all');
    setTestTypeFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = priorityFilter !== 'all' || statusFilter !== 'all' || sectionFilter !== 'all' || testTypeFilter !== 'all' || searchQuery;

  const exportResults = async (format) => {
    if (!selectedRun) return;

    const { data: allResults } = await supabase
      .from('uat_results')
      .select(`
        *,
        uat_cases (id, section, title, priority)
      `)
      .eq('run_id', selectedRun)
      .order('recorded_at');

    if (format === 'json') {
      const blob = new Blob([JSON.stringify({ stats: runStats, results: allResults, defects }, null, 2)],
        { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uat-${selectedRun}.json`;
      a.click();
    } else if (format === 'csv') {
      const csv = [
        'Test ID,Section,Title,Priority,Status,Evidence URL,Notes,Recorded At',
        ...(allResults || []).map(r =>
          `"${r.case_id}","${r.uat_cases.section}","${r.uat_cases.title}","${r.uat_cases.priority}","${r.status}","${r.evidence_url || ''}","${r.notes || ''}","${r.recorded_at}"`
        )
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `uat-${selectedRun}.csv`;
      a.click();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 dark:border-blue-400 mx-auto mb-4"></div>
          <div className="text-lg text-gray-600 dark:text-gray-300">Loading UAT Dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 rounded-lg shadow-lg">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
                UAT Testing Dashboard
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Monitor and manage your user acceptance tests</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-sm hover:shadow font-semibold"
            >
              <Plus className="h-4 w-4" />
              Create Test
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {runStats && (
        <>
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-blue-500">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Total Tests</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100">{runStats.executed}</p>
                </div>
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg self-end sm:self-auto">
                  <FileText className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-green-500">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Passed</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">{runStats.passed}</p>
                </div>
                <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg self-end sm:self-auto">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-red-500">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Failed</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold text-red-600">{runStats.failed}</p>
                </div>
                <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg self-end sm:self-auto">
                  <XCircle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-red-600 dark:text-red-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-yellow-500">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Blocked</p>
                  <p className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-600">{runStats.blocked}</p>
                </div>
                <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg self-end sm:self-auto">
                  <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-yellow-600 dark:text-yellow-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Test Cases Section with Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-purple-600 to-purple-500 dark:from-purple-700 dark:to-purple-600 text-white p-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Test Cases
                <span className="ml-2 bg-white/20 px-2 py-1 rounded-full text-sm">
                  {statusCounts.PASS}/{testCases.length} passed
                </span>
                {activeTestId && (
                  <span className="ml-auto bg-yellow-400/30 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Active: {activeTestId}
                  </span>
                )}
              </h2>
            </div>

            {/* Filter Controls */}
            <div className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
              {/* Filter Toggle Header */}
              <button
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    Filters
                    {hasActiveFilters && (
                      <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    )}
                  </span>
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Collapsible Filter Content */}
              {filtersExpanded && (
                <div className="p-4 pt-0">
              {/* Priority Filters */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Priority</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPriorityFilter('all')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'all'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    All ({priorityCounts.all})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('critical')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'critical'
                        ? 'bg-red-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                    }`}
                  >
                    Critical ({priorityCounts.critical})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('high')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'high'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                    }`}
                  >
                    High ({priorityCounts.high})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('medium')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'medium'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    Medium ({priorityCounts.medium})
                  </button>
                </div>
              </div>

              {/* Status Filters */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Status</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    All ({statusCounts.all})
                  </button>
                  <button
                    onClick={() => setStatusFilter('PASS')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'PASS'
                        ? 'bg-green-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                  >
                    Pass ({statusCounts.PASS})
                  </button>
                  <button
                    onClick={() => setStatusFilter('FAIL')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'FAIL'
                        ? 'bg-red-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                    }`}
                  >
                    Fail ({statusCounts.FAIL})
                  </button>
                  <button
                    onClick={() => setStatusFilter('not_tested')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      statusFilter === 'not_tested'
                        ? 'bg-gray-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    Not Tested ({statusCounts.not_tested})
                  </button>
                  {statusCounts.BLOCKED > 0 && (
                    <button
                      onClick={() => setStatusFilter('BLOCKED')}
                      className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                        statusFilter === 'BLOCKED'
                          ? 'bg-yellow-600 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                      }`}
                    >
                      Blocked ({statusCounts.BLOCKED})
                    </button>
                  )}
                </div>
              </div>

              {/* Section and Test Type Filters Row */}
              <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Section Filter */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Section</label>
                  <select
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="all">All Sections ({getSectionCount('all')})</option>
                    {Object.entries(UAT_SECTIONS).map(([category, sections]) => (
                      <optgroup key={category} label={category}>
                        {sections.map(section => {
                          const count = getSectionCount(section.value);
                          return (
                            <option key={section.value} value={section.value}>
                              {section.label} ({count})
                            </option>
                          );
                        })}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Test Type Filter */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Test Type</label>
                  <select
                    value={testTypeFilter}
                    onChange={(e) => setTestTypeFilter(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="all">All Types ({getTestTypeCount('all')})</option>
                    <option value="automatic">
                      Automatic ({getTestTypeCount('automatic')})
                    </option>
                    <option value="manual">
                      Manual ({getTestTypeCount('manual')})
                    </option>
                  </select>
                </div>
              </div>

              {/* Search and Clear */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search test ID, title, or section..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Filter Summary */}
              {hasActiveFilters && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Showing {filteredTestCases.length} of {testCases.length} tests
                </div>
              )}
                </div>
              )}
            </div>

            <div className="p-4">
              {testCases.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>Loading test cases...</p>
                </div>
              ) : filteredTestCases.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No tests match your filters</p>
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTestCases.map(testCase => (
                    <div
                      key={testCase.id}
                      className={`border rounded-lg p-3 transition-all ${
                        activeTestId === testCase.id
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md'
                          : 'border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${
                              activeTestId === testCase.id
                                ? 'text-purple-700 dark:text-purple-300'
                                : 'text-gray-800 dark:text-gray-200'
                            }`}>
                              {testCase.id}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              testCase.priority === 'critical' ? 'bg-red-100 text-red-700' :
                              testCase.priority === 'high' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {testCase.priority}
                            </span>
                            {testCase.status && (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                testCase.status === 'PASS' ? 'bg-green-100 text-green-700' :
                                testCase.status === 'FAIL' ? 'bg-red-100 text-red-700' :
                                testCase.status === 'BLOCKED' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {testCase.status}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              testCase.test_type === 'manual'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {testCase.test_type === 'manual' ? 'Manual' : 'Auto'}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {testCase.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Section: {testCase.section}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {activeTestId === testCase.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-purple-600 dark:text-purple-400 font-semibold">
                                ACTIVE
                              </span>
                              <button
                                onClick={() => openTestModal(testCase)}
                                className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                              >
                                Continue Test
                              </button>
                            </div>
                          ) : testCase.status ? (
                            <button
                              onClick={() => openTestModal(testCase)}
                              className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                            >
                              Retest
                            </button>
                          ) : (
                            <button
                              onClick={() => openTestModal(testCase)}
                              className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                            >
                              Start Test
                            </button>
                          )}
                          {testCase.status === 'FAIL' && (
                            <button
                              onClick={() => setSdModalTestCase(testCase)}
                              className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-colors text-sm flex items-center gap-1"
                              title="Create Strategic Directive from this failed test using AI"
                            >
                              <Zap className="h-3 w-3" />
                              Create SD
                            </button>
                          )}
                          <button
                            onClick={() => setEditTestCase(testCase)}
                            className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                            title="Edit test case"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to delete test case ${testCase.id}?\n\nThis will also clear any active references and delete associated results.`)) {
                                const { data, error } = await supabase
                                  .rpc('delete_uat_case', { case_id_to_delete: testCase.id });

                                if (error) {
                                  alert('Failed to delete test case: ' + error.message);
                                } else if (data && !data.success) {
                                  alert('Failed to delete test case: ' + data.error);
                                } else {
                                  handleTestCaseDeleted(testCase.id);
                                }
                              }
                            }}
                            className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                            title="Delete test case"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </>
      )}

      {/* No Run Selected - Show Test Cases */}
      {!selectedRun && testCases.length > 0 && (
        <div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 dark:text-yellow-200 text-center">
              No active test run. Click "Start Test" on any test case to begin a new session.
            </p>
          </div>

          {/* Test Cases Section - Always Show */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-500 dark:from-purple-700 dark:to-purple-600 text-white p-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Available Test Cases
                <span className="ml-auto bg-white/20 px-2 py-1 rounded-full text-sm">
                  {testCases.length} tests ready
                </span>
              </h2>
            </div>

            {/* Reuse Filter Controls */}
            <div className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 p-4">
              {/* Priority Filters */}
              <div className="mb-3">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Priority</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPriorityFilter('all')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'all'
                        ? 'bg-purple-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                    }`}
                  >
                    All ({priorityCounts.all})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('critical')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'critical'
                        ? 'bg-red-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                    }`}
                  >
                    Critical ({priorityCounts.critical})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('high')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'high'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                    }`}
                  >
                    High ({priorityCounts.high})
                  </button>
                  <button
                    onClick={() => setPriorityFilter('medium')}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                      priorityFilter === 'medium'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    Medium ({priorityCounts.medium})
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search test ID, title, or section..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="px-4 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {/* Filter Summary */}
              {hasActiveFilters && (
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  Showing {filteredTestCases.length} of {testCases.length} tests
                </div>
              )}
            </div>

            <div className="p-4">
              {filteredTestCases.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>No tests match your filters</p>
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTestCases.map(testCase => (
                  <div
                    key={testCase.id}
                    className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 hover:border-purple-300 dark:hover:border-purple-600 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {testCase.id}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            testCase.priority === 'critical' ? 'bg-red-100 text-red-700' :
                            testCase.priority === 'high' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {testCase.priority}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {testCase.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Section: {testCase.section}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setActiveTest(testCase.id)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                        >
                          Start Test
                        </button>
                        {testCase.status === 'FAIL' && (
                          <button
                            onClick={() => setSdModalTestCase(testCase)}
                            className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-colors text-sm flex items-center gap-1"
                            title="Create Strategic Directive from this failed test using AI"
                          >
                            <Zap className="h-3 w-3" />
                            Create SD
                          </button>
                        )}
                        <button
                          onClick={() => setEditTestCase(testCase)}
                          className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                          title="Edit test case"
                        >
                          <Edit3 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (window.confirm(`Are you sure you want to delete test case ${testCase.id}?\n\nThis will also clear any active references and delete associated results.`)) {
                              const { data, error } = await supabase
                                .rpc('delete_uat_case', { case_id_to_delete: testCase.id });

                              if (error) {
                                alert('Failed to delete test case: ' + error.message);
                              } else if (data && !data.success) {
                                alert('Failed to delete test case: ' + data.error);
                              } else {
                                handleTestCaseDeleted(testCase.id);
                              }
                            }
                          }}
                          className="p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title="Delete test case"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {!selectedRun && testCases.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">Loading test cases...</p>
        </div>
      )}

      {/* Test Execution Modal */}
      {modalTestCase && (
        <TestExecutionModal
          testCase={modalTestCase}
          runId={modalTestCase.runId}
          onClose={handleModalClose}
          onComplete={handleTestComplete}
        />
      )}

      {/* Create Test Case Modal */}
      {createModalOpen && (
        <CreateTestCaseModal
          onClose={() => setCreateModalOpen(false)}
          onSave={handleTestCaseCreated}
        />
      )}

      {/* Edit Test Case Modal */}
      {editTestCase && (
        <EditTestCaseModal
          testCase={editTestCase}
          onClose={() => setEditTestCase(null)}
          onSave={handleTestCaseUpdated}
          onDelete={handleTestCaseDeleted}
        />
      )}

      {/* SD Generation Modal */}
      {sdModalTestCase && (
        <SDGenerationModal
          testResult={sdModalTestCase}
          onClose={() => setSdModalTestCase(null)}
          onSuccess={(submission) => {
            setSdModalTestCase(null);
            alert(`Strategic Directive created successfully!\nSubmission ID: ${submission.id}\nSD ID: ${submission.sd_id}`);
          }}
        />
      )}
    </div>
  );
}

export default UATDashboard;
