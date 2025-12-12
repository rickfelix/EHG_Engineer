/**
 * useCapabilities - React hook for EHG capability data
 * SD: SD-EHG-CAPABILITIES-001
 */

import { useState, useEffect, useCallback } from 'react';
import { CapabilityProvider } from '../lib/capabilityProvider.ts';

export function useCapabilities(options = {}) {
  const { type, autoLoad = true } = options;

  const [capabilities, setCapabilities] = useState([]);
  const [counts, setCounts] = useState({ agent: 0, tool: 0, crew: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCapabilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [caps, capCounts] = await Promise.all([
        type
          ? CapabilityProvider.getCapabilitiesByType(type)
          : CapabilityProvider.getAllCapabilities(),
        CapabilityProvider.getCapabilityCounts()
      ]);
      setCapabilities(caps);
      setCounts(capCounts);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  const searchCapabilities = useCallback(async (query) => {
    if (!query || query.length < 2) {
      return loadCapabilities();
    }
    setLoading(true);
    setError(null);
    try {
      const results = await CapabilityProvider.searchCapabilities(query);
      setCapabilities(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadCapabilities]);

  useEffect(() => {
    if (autoLoad) {
      loadCapabilities();
    }
  }, [autoLoad, loadCapabilities]);

  return {
    capabilities,
    counts,
    loading,
    error,
    refresh: loadCapabilities,
    search: searchCapabilities
  };
}

export default useCapabilities;
