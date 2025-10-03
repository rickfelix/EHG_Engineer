import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  X,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Camera,
  Copy,
  ExternalLink,
  Loader,
  ClipboardPaste,
  Bot,
  FileText,
  Sparkles
} from 'lucide-react';
import { SDGenerationModal } from './SDGenerationModal';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function TestExecutionModal({ testCase, runId, onClose, onComplete }) {
  const [status, setStatus] = useState(null);
  const [notes, setNotes] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [showSDGenerator, setShowSDGenerator] = useState(false);
  const [savedResult, setSavedResult] = useState(null);
  const pasteAreaRef = useRef(null);

  // Handle paste event for screenshots
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          const reader = new FileReader();
          reader.onload = (event) => {
            setScreenshot(event.target.result);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    // Add paste listener to the whole modal
    const modal = pasteAreaRef.current;
    if (modal) {
      modal.addEventListener('paste', handlePaste);
      return () => modal.removeEventListener('paste', handlePaste);
    }
  }, []);

  const copyTestId = () => {
    navigator.clipboard.writeText(testCase.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyUATPrompt = () => {
    const prompt = `Please activate the UAT sub-agent to help me execute test case ${testCase.id}.

UAT TEST EXECUTION REQUEST
Test ID: ${testCase.id}
Title: ${testCase.title}
Type: ${testCase.test_type === 'manual' ? 'Manual' : 'Automated'}
Priority: ${testCase.priority}
Section: ${testCase.section.replace(/_/g, ' ')}

Test Description:
${testCase.description || 'No detailed description available'}

I need the UAT sub-agent to guide me through this test by:
1. Breaking down the specific actions I should take
2. Clarifying what expected results I should see
3. Identifying any edge cases I should check
4. Warning me about common issues to watch for
5. Helping me determine if the test passes or fails

Test Environment Details:
- Application URL: http://localhost:8080
- System: EHG Application
- Current Test Case: ${testCase.id}

AUTOMATED EXECUTION OPTION:
You can also run this test automatically using:
\`\`\`bash
node scripts/uat-test-executor.js ${testCase.id}
\`\`\`

Please engage the UAT sub-agent now to begin test guidance.`;

    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleSaveResult = async () => {
    if (!status) {
      alert('Please select a test result (Pass/Fail/Blocked)');
      return;
    }

    setSaving(true);
    try {
      // Save the test result
      const { error } = await supabase
        .from('uat_results')
        .upsert({
          run_id: runId,
          case_id: testCase.id,
          status: status,
          notes: notes || null,
          evidence_url: screenshot || null,
          recorded_at: new Date().toISOString()
        }, {
          onConflict: 'run_id,case_id'
        });

      if (error) throw error;

      // Store the result for potential SD conversion
      setSavedResult({
        result_id: crypto.randomUUID(),
        case_id: testCase.id,
        run_id: runId,
        status: status,
        title: testCase.title,
        section: testCase.section,
        priority: testCase.priority,
        description: testCase.description,
        expected: 'Test should pass as described',
        actual: status === 'FAIL' ? notes : 'Test executed successfully',
        notes: notes,
        screenshot_url: screenshot
      });

      // Clear active test
      await supabase
        .from('uat_runs')
        .update({ active_case_id: null })
        .eq('id', runId);

      onComplete(status);
    } catch (error) {
      console.error('Failed to save test result:', error);
      alert('Failed to save test result. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div
        ref={pasteAreaRef}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-purple-500 dark:from-purple-700 dark:to-purple-600 text-white p-6 rounded-t-xl">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Execute Test Case</h2>
              <div className="flex items-center gap-3">
                <span className="font-mono bg-white/20 px-2 py-1 rounded">
                  {testCase.id}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  testCase.priority === 'critical' ? 'bg-red-500' :
                  testCase.priority === 'high' ? 'bg-yellow-500' :
                  'bg-white/30'
                }`}>
                  {testCase.priority}
                </span>
                <span className="px-2 py-1 rounded text-xs font-semibold bg-white/30">
                  {testCase.test_type === 'manual' ? 'Manual' : 'Auto'}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Test Details */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
              {testCase.title}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              {testCase.description || 'No detailed description available. Please refer to the test title for guidance.'}
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex gap-3">
            <button
              onClick={copyTestId}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Copy className="h-4 w-4" />
              {copiedId ? 'Copied!' : 'Copy Test ID'}
            </button>
            <button
              onClick={copyUATPrompt}
              className="flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
            >
              <Bot className="h-4 w-4" />
              {copiedPrompt ? 'Copied!' : 'Copy UAT Agent Prompt'}
            </button>
            <a
              href="http://localhost:8080"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open Test App
            </a>
          </div>

          {/* Test Result Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Test Result *
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setStatus('PASS')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  status === 'PASS'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-green-400'
                }`}
              >
                <CheckCircle className={`h-6 w-6 mx-auto mb-2 ${
                  status === 'PASS' ? 'text-green-600' : 'text-gray-400'
                }`} />
                <span className={`font-semibold ${
                  status === 'PASS' ? 'text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-gray-400'
                }`}>
                  Pass
                </span>
              </button>
              <button
                onClick={() => setStatus('FAIL')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  status === 'FAIL'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-red-400'
                }`}
              >
                <XCircle className={`h-6 w-6 mx-auto mb-2 ${
                  status === 'FAIL' ? 'text-red-600' : 'text-gray-400'
                }`} />
                <span className={`font-semibold ${
                  status === 'FAIL' ? 'text-red-700 dark:text-red-300' : 'text-gray-600 dark:text-gray-400'
                }`}>
                  Fail
                </span>
              </button>
              <button
                onClick={() => setStatus('BLOCKED')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  status === 'BLOCKED'
                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-yellow-400'
                }`}
              >
                <AlertTriangle className={`h-6 w-6 mx-auto mb-2 ${
                  status === 'BLOCKED' ? 'text-yellow-600' : 'text-gray-400'
                }`} />
                <span className={`font-semibold ${
                  status === 'BLOCKED' ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-600 dark:text-gray-400'
                }`}>
                  Blocked
                </span>
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Observations & Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what happened during the test, any issues found, or additional observations..."
              className="w-full h-32 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Screenshot Upload/Paste Area */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Screenshot Evidence
            </label>
            {!screenshot ? (
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                <Camera className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Paste screenshot (Ctrl+V) or upload an image
                </p>
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <ClipboardPaste className="h-4 w-4" />
                    <span>Press Ctrl+V to paste</span>
                  </div>
                  <span className="text-gray-400">or</span>
                  <label className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                    Browse Files
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <div className="relative">
                <img
                  src={screenshot}
                  alt="Test screenshot"
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600"
                />
                <button
                  onClick={() => setScreenshot(null)}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Strategic Directive Conversion Option (shows after saving a failure) */}
          {savedResult && savedResult.status === 'FAIL' && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-2 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Convert to Strategic Directive
                  </h4>
                  <p className="text-sm text-indigo-700 dark:text-indigo-400 mb-3">
                    This test failure can be automatically converted into a Strategic Directive using AI to analyze the issue and create comprehensive documentation.
                  </p>
                  <ul className="text-xs text-indigo-600 dark:text-indigo-500 space-y-1">
                    <li>• AI analyzes business impact and priority</li>
                    <li>• Generates complete SD documentation</li>
                    <li>• Links to this UAT test for traceability</li>
                    <li>• Creates actionable requirements</li>
                  </ul>
                </div>
                <button
                  onClick={() => setShowSDGenerator(true)}
                  className="ml-4 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Create SD
                </button>
              </div>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
              💡 Testing Tips
            </h4>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
              <li>• Click "Copy UAT Agent Prompt" to get AI assistance for this test</li>
              <li>• Take screenshots of any issues or important results</li>
              <li>• Paste screenshots directly with Ctrl+V (no need to save first)</li>
              <li>• Add detailed notes about what you observed</li>
              <li>• Mark as "Blocked" if you can't complete the test due to dependencies</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-between">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveResult}
              disabled={!status || saving}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
                status && !saving
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving && <Loader className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save Test Result'}
            </button>
          </div>
        </div>
      </div>

      {/* SD Generation Modal */}
      {showSDGenerator && savedResult && (
        <SDGenerationModal
          testResult={savedResult}
          onClose={() => setShowSDGenerator(false)}
          onSuccess={(submission) => {
            setShowSDGenerator(false);
            alert(`Strategic Directive created successfully!\nSubmission ID: ${submission.id}\nSD ID: ${submission.sd_id}`);
          }}
        />
      )}
    </div>
  );
}