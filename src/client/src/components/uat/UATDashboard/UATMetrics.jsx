import React from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText
} from 'lucide-react';

export function UATMetrics({ runStats }) {
  if (!runStats) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {/* Total Tests */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-blue-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Total Tests</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100">
              {runStats.executed}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg self-end sm:self-auto">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
      </div>

      {/* Passed */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-green-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Passed</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-600">
              {runStats.passed}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg self-end sm:self-auto">
            <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-green-600 dark:text-green-400" />
          </div>
        </div>
      </div>

      {/* Failed */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-red-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Failed</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-red-600">
              {runStats.failed}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg self-end sm:self-auto">
            <XCircle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-red-600 dark:text-red-400" />
          </div>
        </div>
      </div>

      {/* Blocked */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-3 sm:p-4 md:p-6 border-l-4 border-yellow-500">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm">Blocked</p>
            <p className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-600">
              {runStats.blocked}
            </p>
          </div>
          <div className="p-2 sm:p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg self-end sm:self-auto">
            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default UATMetrics;
