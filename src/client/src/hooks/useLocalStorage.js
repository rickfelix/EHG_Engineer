import { useState, useEffect } from 'react';

export function useLocalStorage(key, initialValue) {
  // Get initial value from localStorage or use provided initial value
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Save to localStorage whenever value changes
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error(`Error saving to localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  // Return a wrapped version of useState's setter function that persists the new value to localStorage
  const setValue = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}

// Hook to sync state across tabs/windows
export function useSyncedLocalStorage(key, initialValue) {
  const [value, setValue] = useLocalStorage(key, initialValue);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue) {
        try {
          setValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error('Error syncing localStorage:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [value, setValue];
}

// Hook to persist user preferences
export function useUserPreferences() {
  const [preferences, setPreferences] = useLocalStorage('leo-dashboard-preferences', {
    theme: 'light',
    sidebarCollapsed: false,
    refreshInterval: 30000,
    notifications: true,
    compactView: false
  });

  const updatePreference = (key, value) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return { preferences, updatePreference };
}

// Hook to persist dashboard state
export function usePersistentState(key, initialValue) {
  const [state, setState] = useLocalStorage(`leo-dashboard-${key}`, initialValue);

  // Clear state
  const clearState = () => {
    window.localStorage.removeItem(`leo-dashboard-${key}`);
    setState(initialValue);
  };

  return [state, setState, clearState];
}