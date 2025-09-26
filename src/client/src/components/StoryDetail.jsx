import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.ts';
import LoadingSkeleton from './LoadingSkeleton';
import Button from './ui/Button';
import Toast from './ui/Toast';

export default function StoryDetail() {
  const { sdKey, storyKey } = useParams();
  const navigate = useNavigate();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadStory();
  }, [sdKey, storyKey]);

  async function loadStory() {
    try {
      const { data, error } = await supabase
        .from('v_story_verification_status')
        .select('*')
        .eq('sd_key', sdKey)
        .eq('story_key', storyKey)
        .single();

      if (error) throw error;
      setStory(data);
    } catch (error) {
      console.error('Failed to load story:', error);
      setToast({
        type: 'error',
        message: 'Failed to load story details'
      });
    } finally {
      setLoading(false);
    }
  }

  async function triggerVerification() {
    setVerifying(true);
    try {
      const response = await fetch('/api/stories/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story_keys: [storyKey],
          test_run_id: 'manual-' + Date.now(),
          build_id: 'manual',
          status: 'not_run'
        })
      });

      if (response.ok) {
        setToast({
          type: 'success',
          message: 'Verification triggered successfully'
        });
        await loadStory();
      } else {
        throw new Error('Verification request failed');
      }
    } catch (error) {
      console.error('Failed to trigger verification:', error);
      setToast({
        type: 'error',
        message: 'Failed to trigger verification'
      });
    } finally {
      setVerifying(false);
    }
  }

  const formatAcceptance = (criteria) => {
    if (!criteria || !criteria[0]) return null;
    const ac = criteria[0];

    // Check if it has Given/When/Then format
    if (ac.given || ac.when || ac.then) {
      return (
        <div className="space-y-2 bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
          {ac.given && (
            <div>
              <span className="font-semibold text-blue-600 dark:text-blue-400">GIVEN:</span>
              <span className="ml-2 text-gray-700 dark:text-gray-300">{ac.given}</span>
            </div>
          )}
          {ac.when && (
            <div>
              <span className="font-semibold text-green-600 dark:text-green-400">WHEN:</span>
              <span className="ml-2 text-gray-700 dark:text-gray-300">{ac.when}</span>
            </div>
          )}
          {ac.then && (
            <div>
              <span className="font-semibold text-purple-600 dark:text-purple-400">THEN:</span>
              <span className="ml-2 text-gray-700 dark:text-gray-300">{ac.then}</span>
            </div>
          )}
        </div>
      );
    }

    // Fallback to text format
    if (ac.text || ac.title) {
      return (
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
          {ac.title && <h4 className="font-semibold mb-2">{ac.title}</h4>}
          <p className="text-gray-700 dark:text-gray-300">{ac.text || ac.title}</p>
        </div>
      );
    }

    return <p className="text-gray-500 dark:text-gray-400">No acceptance criteria defined</p>;
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      passing: { bg: 'bg-green-100 dark:bg-green-900/50', text: 'text-green-800 dark:text-green-300', icon: '✅' },
      failing: { bg: 'bg-red-100 dark:bg-red-900/50', text: 'text-red-800 dark:text-red-300', icon: '❌' },
      not_run: { bg: 'bg-gray-100 dark:bg-gray-900/50', text: 'text-gray-800 dark:text-gray-300', icon: '⏸️' }
    };

    const config = statusConfig[status] || statusConfig.not_run;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
        {config.icon} {status}
      </span>
    );
  };

  if (loading) return <LoadingSkeleton count={3} />;
  if (!story) return (
    <div className="p-6">
      <div className="text-center py-8">
        <p className="text-gray-500 dark:text-gray-400">Story not found</p>
        <Button onClick={() => navigate(`/stories/${sdKey}`)} className="mt-4">
          Back to Stories
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button
          onClick={() => navigate(`/stories/${sdKey}`)}
          variant="secondary"
          className="flex items-center gap-2"
        >
          ← Back to Stories
        </Button>
        <h1 className="text-2xl font-bold dark:text-white">
          Story: {story.story_key}
        </h1>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2 dark:text-white">
            {story.story_title}
          </h2>
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>Priority: <strong>{story.priority || 'Medium'}</strong></span>
            <span>Sequence: <strong>#{story.sequence_no}</strong></span>
            {story.parent_id && <span>Parent: <strong>{story.parent_id}</strong></span>}
          </div>
        </div>

        <div className="border-t pt-6 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3 dark:text-white">Acceptance Criteria</h3>
          {formatAcceptance(story.acceptance_criteria)}
        </div>

        <div className="border-t pt-6 dark:border-gray-700">
          <h3 className="text-lg font-semibold mb-3 dark:text-white">Verification Status</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
              {getStatusBadge(story.status)}
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Coverage</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${story.coverage_pct || 0}%` }}
                  />
                </div>
                <span className="text-sm font-medium dark:text-white">
                  {story.coverage_pct || 0}%
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Last Run</p>
              <p className="font-medium dark:text-white">
                {story.last_run_at ? new Date(story.last_run_at).toLocaleString() : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Build ID</p>
              <p className="font-medium dark:text-white">{story.build_id || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-6 flex justify-end gap-3 dark:border-gray-700">
          <Button
            onClick={triggerVerification}
            disabled={verifying}
            variant="primary"
          >
            {verifying ? 'Triggering...' : 'Trigger Verification'}
          </Button>
        </div>
      </div>

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