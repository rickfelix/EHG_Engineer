/**
 * useStageArtifacts Hook
 * Manages loading and saving artifacts for venture stages
 *
 * SD: SD-INDUSTRIAL-2025-001 (Sovereign Industrial Expansion)
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook to manage artifacts for a specific venture stage
 * @param {string} ventureId - The venture UUID
 * @param {number} stage - The stage number (1-25)
 * @param {string} artifactType - The type of artifact (e.g., 'pricing_model', 'business_canvas')
 * @param {any} defaultData - Default data to use if no artifact exists
 */
export function useStageArtifacts(ventureId, stage, artifactType, defaultData = null) {
  const [data, setData] = useState(defaultData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  // Load artifact data on mount
  useEffect(() => {
    const loadArtifact = async () => {
      if (!ventureId || !stage) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/ventures/${ventureId}/artifacts?stage=${stage}`
        );

        if (!response.ok) {
          throw new Error('Failed to load artifacts');
        }

        const artifacts = await response.json();

        // Find the artifact matching our type
        const artifact = artifacts.find(a => a.type === artifactType);

        if (artifact && artifact.content) {
          // Parse content if it's a string
          const parsedData = typeof artifact.content === 'string'
            ? JSON.parse(artifact.content)
            : artifact.content;
          setData(parsedData);
          setLastSaved(new Date(artifact.updated_at || artifact.created_at));
        } else {
          setData(defaultData);
        }
      } catch (err) {
        console.error('Error loading artifact:', err);
        setError(err.message);
        setData(defaultData);
      } finally {
        setLoading(false);
      }
    };

    loadArtifact();
  }, [ventureId, stage, artifactType]);

  // Save artifact data
  const saveArtifact = useCallback(async (newData, title = null) => {
    if (!ventureId || !stage) {
      console.warn('Cannot save: missing ventureId or stage');
      return false;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/ventures/${ventureId}/artifacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stage,
          artifact_type: artifactType,
          title: title || `${artifactType} - Stage ${stage}`,
          content: JSON.stringify(newData),
          metadata: {
            summary: `${artifactType} artifact for stage ${stage}`,
            saved_at: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save artifact');
      }

      const savedArtifact = await response.json();
      setData(newData);
      setLastSaved(new Date(savedArtifact.created_at));
      return true;
    } catch (err) {
      console.error('Error saving artifact:', err);
      setError(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [ventureId, stage, artifactType]);

  // Update local data (without saving)
  const updateData = useCallback((updater) => {
    setData(prev => {
      if (typeof updater === 'function') {
        return updater(prev);
      }
      return updater;
    });
  }, []);

  // Auto-save with debounce
  const autoSave = useCallback((newData, delay = 2000) => {
    // Clear any existing timeout
    if (autoSave.timeoutId) {
      clearTimeout(autoSave.timeoutId);
    }

    // Set new timeout
    autoSave.timeoutId = setTimeout(() => {
      saveArtifact(newData);
    }, delay);
  }, [saveArtifact]);

  return {
    data,
    setData: updateData,
    loading,
    saving,
    error,
    lastSaved,
    saveArtifact,
    autoSave
  };
}

/**
 * Hook to load all artifacts for a venture stage
 * @param {string} ventureId - The venture UUID
 * @param {number} stage - The stage number (1-25)
 */
export function useAllStageArtifacts(ventureId, stage) {
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadArtifacts = async () => {
      if (!ventureId || !stage) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(
          `/api/ventures/${ventureId}/artifacts?stage=${stage}`
        );

        if (!response.ok) {
          throw new Error('Failed to load artifacts');
        }

        const data = await response.json();
        setArtifacts(data);
      } catch (err) {
        console.error('Error loading artifacts:', err);
        setError(err.message);
        setArtifacts([]);
      } finally {
        setLoading(false);
      }
    };

    loadArtifacts();
  }, [ventureId, stage]);

  const refresh = useCallback(async () => {
    if (!ventureId || !stage) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/ventures/${ventureId}/artifacts?stage=${stage}`
      );
      if (response.ok) {
        const data = await response.json();
        setArtifacts(data);
      }
    } catch (err) {
      console.error('Error refreshing artifacts:', err);
    } finally {
      setLoading(false);
    }
  }, [ventureId, stage]);

  return { artifacts, loading, error, refresh };
}

export default useStageArtifacts;
