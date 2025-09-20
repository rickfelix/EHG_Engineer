import React, { useState, useEffect, useLayoutEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

const DarkModeToggle = ({ className = "" }) => {
  // Check initial state from localStorage, default to dark
  const getInitialTheme = () => {
    const savedTheme = localStorage.getItem('theme');
    // Default to dark if no saved preference
    if (!savedTheme) {
      return true; // Default to dark mode
    }
    return savedTheme === 'dark';
  };
  
  const [isDark, setIsDark] = useState(getInitialTheme);
  const [isAnimating, setIsAnimating] = useState(false);

  // Use useLayoutEffect to apply theme before paint to prevent flash
  useLayoutEffect(() => {
    const root = document.documentElement;
    // Always ensure the DOM matches our state
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);
  
  // Force reapply on mount to handle React hydration clearing classes
  useEffect(() => {
    // Apply theme after a micro delay to ensure React has fully settled
    const applyTheme = setTimeout(() => {
      const root = document.documentElement;
      const savedTheme = localStorage.getItem('theme');
      const shouldBeDark = savedTheme !== 'light'; // Default to dark
      
      if (shouldBeDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        if (!savedTheme) {
          localStorage.setItem('theme', 'dark');
        }
        setIsDark(true);
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        setIsDark(false);
      }
    }, 10); // Small delay to let React hydrate
    
    return () => clearTimeout(applyTheme);
  }, []); // Run only once on mount

  const updateTheme = (dark) => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      root.classList.remove('light');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('theme', 'light');
    }
  };

  const toggleTheme = () => {
    if (isAnimating) return; // Prevent rapid clicking during animation
    
    setIsAnimating(true);
    const newTheme = !isDark;
    setIsDark(newTheme);
    updateTheme(newTheme);
    
    // Reset animation state after transition completes
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <button
      onClick={toggleTheme}
      className={`
        relative flex items-center justify-center
        w-12 h-6 rounded-full transition-all duration-300 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        ${isDark ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}
        ${isAnimating ? 'scale-95' : 'hover:scale-105'}
        ${className}
      `}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      disabled={isAnimating}
    >
      {/* Toggle track background with gradient effect */}
      <div className={`
        absolute inset-0 rounded-full transition-all duration-300
        ${isDark 
          ? 'bg-gradient-to-r from-blue-600 to-blue-500' 
          : 'bg-gradient-to-r from-gray-300 to-gray-200'
        }
      `} />
      
      {/* Moving toggle circle */}
      <div className={`
        relative w-5 h-5 rounded-full transition-all duration-300 ease-in-out transform
        bg-white dark:bg-gray-100 shadow-lg
        flex items-center justify-center
        ${isDark ? 'translate-x-3' : '-translate-x-3'}
        ${isAnimating ? 'scale-90' : ''}
      `}>
        {/* Icon with fade transition */}
        <div className={`
          absolute inset-0 flex items-center justify-center
          transition-opacity duration-200
          ${isDark ? 'opacity-100' : 'opacity-0'}
        `}>
          <Moon className="w-3 h-3 text-blue-600 dark:text-blue-500" />
        </div>
        
        <div className={`
          absolute inset-0 flex items-center justify-center
          transition-opacity duration-200
          ${isDark ? 'opacity-0' : 'opacity-100'}
        `}>
          <Sun className="w-3 h-3 text-yellow-500" />
        </div>
      </div>

      {/* Subtle glow effect on hover */}
      <div className={`
        absolute inset-0 rounded-full opacity-0 transition-opacity duration-300
        ${isDark 
          ? 'bg-blue-400 group-hover:opacity-20' 
          : 'bg-yellow-400 group-hover:opacity-20'
        }
        pointer-events-none
      `} />
    </button>
  );
};

export default DarkModeToggle;