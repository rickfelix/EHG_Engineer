import React from 'react';
import { createClient } from '@supabase/supabase-js';
import { Zap, Edit3, Trash2, FileText } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function TestCaseList({
  testCases,
  filteredTestCases,
  activeTestId,
  onOpenTestModal,
  onSetEditTestCase,
  onSetSdModalTestCase,
  onTestCaseDeleted,
  clearFilters,
  hasActiveFilters,
  showActive = true
}) {
  const handleDeleteTestCase = async (testCase) => {
    if (window.confirm(`Are you sure you want to delete test case ${testCase.id}?\n\nThis will also clear any active references and delete associated results.`)) {
      const { data, error } = await supabase
        .rpc('delete_uat_case', { case_id_to_delete: testCase.id });

      if (error) {
        alert('Failed to delete test case: ' + error.message);
      } else if (data && !data.success) {
        alert('Failed to delete test case: ' + data.error);
      } else {
        onTestCaseDeleted(testCase.id);
      }
    }
  };

  if (testCases.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
        <p>Loading test cases...</p>
      </div>
    );
  }

  if (filteredTestCases.length === 0) {
    return (
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
    );
  }

  return (
    <div className="space-y-2">
      {filteredTestCases.map(testCase => (
        <div
          key={testCase.id}
          className={`border rounded-lg p-3 transition-all ${
            showActive && activeTestId === testCase.id
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-600'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${
                  showActive && activeTestId === testCase.id
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
              {showActive && activeTestId === testCase.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-purple-600 dark:text-purple-400 font-semibold">
                    ACTIVE
                  </span>
                  <button
                    onClick={() => onOpenTestModal(testCase)}
                    className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  >
                    Continue Test
                  </button>
                </div>
              ) : testCase.status ? (
                <button
                  onClick={() => onOpenTestModal(testCase)}
                  className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Retest
                </button>
              ) : (
                <button
                  onClick={() => onOpenTestModal(testCase)}
                  className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                >
                  Start Test
                </button>
              )}
              {testCase.status === 'FAIL' && (
                <button
                  onClick={() => onSetSdModalTestCase(testCase)}
                  className="px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg hover:from-indigo-600 hover:to-purple-600 transition-colors text-sm flex items-center gap-1"
                  title="Create Strategic Directive from this failed test using AI"
                >
                  <Zap className="h-3 w-3" />
                  Create SD
                </button>
              )}
              <button
                onClick={() => onSetEditTestCase(testCase)}
                className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                title="Edit test case"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDeleteTestCase(testCase)}
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
  );
}

export default TestCaseList;
