import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  Plus,
  RefreshCw,
  Shield,
  FileText,
  Zap
} from 'lucide-react';
import { TestExecutionModal } from './TestExecutionModal';
import { CreateTestCaseModal } from './CreateTestCaseModal';
import { EditTestCaseModal } from './EditTestCaseModal';
import { SDGenerationModal } from './SDGenerationModal';
import { TestingCampaignManager } from './TestingCampaignManager';
import { UATMetrics, UATFilters, TestCaseList } from './UATDashboard/index';

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
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editTestCase, setEditTestCase] = useState(null);
  const [sdModalTestCase, setSdModalTestCase] = useState(null);

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

    // Try to set active test in database
    try {
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

  const clearFilters = () => {
    setPriorityFilter('all');
    setStatusFilter('all');
    setSectionFilter('all');
    setTestTypeFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = priorityFilter !== 'all' || statusFilter !== 'all' || sectionFilter !== 'all' || testTypeFilter !== 'all' || searchQuery;

  // Count statistics for display
  const statusCounts = {
    all: testCases.length,
    PASS: testCases.filter(t => t.status === 'PASS').length,
    FAIL: testCases.filter(t => t.status === 'FAIL').length,
    BLOCKED: testCases.filter(t => t.status === 'BLOCKED').length,
    NA: testCases.filter(t => t.status === 'NA').length,
    not_tested: testCases.filter(t => !t.status).length
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
      {/* Testing Campaign Manager */}
      <TestingCampaignManager />

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

      {/* Metrics Section */}
      <UATMetrics runStats={runStats} />

      {/* Test Cases Section with Filters */}
      {runStats && (
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
          <UATFilters
            testCases={testCases}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sectionFilter={sectionFilter}
            setSectionFilter={setSectionFilter}
            testTypeFilter={testTypeFilter}
            setTestTypeFilter={setTestTypeFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filtersExpanded={filtersExpanded}
            setFiltersExpanded={setFiltersExpanded}
            clearFilters={clearFilters}
            hasActiveFilters={hasActiveFilters}
            filteredTestCases={filteredTestCases}
          />

          {/* Test Case List */}
          <div className="p-4">
            <TestCaseList
              testCases={testCases}
              filteredTestCases={filteredTestCases}
              activeTestId={activeTestId}
              onOpenTestModal={openTestModal}
              onSetEditTestCase={setEditTestCase}
              onSetSdModalTestCase={setSdModalTestCase}
              onTestCaseDeleted={handleTestCaseDeleted}
              clearFilters={clearFilters}
              hasActiveFilters={hasActiveFilters}
              showActive={true}
            />
          </div>
        </div>
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
              {/* Simplified filters for no-run state */}
              <UATFilters
                testCases={testCases}
                priorityFilter={priorityFilter}
                setPriorityFilter={setPriorityFilter}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                sectionFilter={sectionFilter}
                setSectionFilter={setSectionFilter}
                testTypeFilter={testTypeFilter}
                setTestTypeFilter={setTestTypeFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                filtersExpanded={true}
                setFiltersExpanded={setFiltersExpanded}
                clearFilters={clearFilters}
                hasActiveFilters={hasActiveFilters}
                filteredTestCases={filteredTestCases}
                searchInputId="uat-search-no-run"
              />
            </div>

            <div className="p-4">
              <TestCaseList
                testCases={testCases}
                filteredTestCases={filteredTestCases}
                activeTestId={activeTestId}
                onOpenTestModal={openTestModal}
                onSetEditTestCase={setEditTestCase}
                onSetSdModalTestCase={setSdModalTestCase}
                onTestCaseDeleted={handleTestCaseDeleted}
                clearFilters={clearFilters}
                hasActiveFilters={hasActiveFilters}
                showActive={false}
              />
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
