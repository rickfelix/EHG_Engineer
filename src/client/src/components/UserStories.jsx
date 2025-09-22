import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import LoadingSkeleton from './LoadingSkeleton';
import SmartRefreshButton from './SmartRefreshButton';
import ProgressBar from './ui/ProgressBar';
import Toast from './ui/Toast';

const FEATURE_FLAGS = {
  FEATURE_STORY_UI: import.meta.env.VITE_FEATURE_STORY_UI === 'true',
  FEATURE_STORY_GATES: import.meta.env.VITE_FEATURE_STORY_GATES === 'true'
};

export default function UserStories() {
  const { sdKey } = useParams();
  const navigate = useNavigate();
  const [stories, setStories] = useState([]);
  const [gate, setGate] = useState(null);
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all'
  });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!FEATURE_FLAGS.FEATURE_STORY_UI) {
      navigate('/');
      return;
    }
    loadStories();
  }, [sdKey, filters]);

  useEffect(() => {
    if (FEATURE_FLAGS.FEATURE_STORY_GATES && sdKey) {
      loadGateStatus();
    }
  }, [sdKey]);

  async function loadStories() {
    setLoading(true);
    try {
      let query = supabase
        .from('v_story_verification_status')
        .select('*');

      if (sdKey) {
        query = query.eq('sd_key', sdKey);
      }

      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }

      query = query.order('sequence_no', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      setStories(data || []);
    } catch (error) {
      console.error('Failed to load stories:', error);
      setToast({
        type: 'error',
        message: 'Failed to load stories'
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadGateStatus() {
    try {
      const { data, error } = await supabase
        .from('v_sd_release_gate')
        .select('*')
        .eq('sd_key', sdKey)
        .single();

      if (!error) {
        setGate(data);
      }
    } catch (error) {
      console.error('Failed to load gate status:', error);
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'passing': return '✅';
      case 'failing': return '❌';
      case 'not_run': return '⏸️';
      default: return '❓';
    }
  };

  const getGateStatus = () => {
    if (!gate) return null;

    if (gate.ready) {
      return (
        <div className="bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-green-800 dark:text-green-300 font-semibold">
              🟢 READY FOR RELEASE
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              All {gate.total_stories} stories passing
            </span>
          </div>
        </div>
      );
    }

    const pct = gate.passing_pct || 0;
    return (
      <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-yellow-800 dark:text-yellow-300 font-semibold">
              🟡 PARTIAL RELEASE
            </span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {gate.passing_count}/{gate.total_stories} passing
            </span>
          </div>
          <ProgressBar value={pct} max={100} />
        </div>
      </div>
    );
  };

  if (loading) {
    return <LoadingSkeleton count={5} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold dark:text-white">
          📚 User Stories {sdKey && `- ${sdKey}`}
        </h1>
        <SmartRefreshButton onRefresh={loadStories} />
      </div>

      <div className="flex gap-4 items-center bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium dark:text-gray-300">Status:</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All</option>
            <option value="passing">Passing</option>
            <option value="failing">Failing</option>
            <option value="not_run">Not Run</option>
          </select>
        </label>

        <label className="flex items-center gap-2">
          <span className="text-sm font-medium dark:text-gray-300">Priority:</span>
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                #
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Story ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Title
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Coverage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {stories.map((story, idx) => (
              <tr key={story.story_key} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {story.sequence_no || idx + 1}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                  {story.story_key.split(':')[1]}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                  {story.story_title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                    {getStatusIcon(story.status)} {story.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                  {story.coverage_pct ? `${story.coverage_pct}%` : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    to={`/stories/${story.sd_key}/${story.story_key}`}
                    className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {stories.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No stories found
          </div>
        )}
      </div>

      {FEATURE_FLAGS.FEATURE_STORY_GATES && gate && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3 dark:text-white">Release Gate Status</h3>
          {getGateStatus()}
        </div>
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