import { useEffect, useState } from 'react';

/**
 * Hook to detect if the user prefers reduced motion
 * Respects the prefers-reduced-motion media query
 * @returns {boolean} True if reduced motion is preferred
 */
export function useReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') return false;
    
    // Check the media query on initial render
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
  });

  useEffect(() => {
    // Skip if not in browser
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    
    // Update state when media query changes
    const handleChange = (event) => {
      setPrefersReducedMotion(event.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } 
    // Legacy browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to get animation variants based on reduced motion preference
 * @param {Object} fullVariants - Full animation variants
 * @param {Object} reducedVariants - Reduced motion variants (optional)
 * @returns {Object} Appropriate animation variants
 */
export function useMotionVariants(fullVariants, reducedVariants = {}) {
  const prefersReducedMotion = useReducedMotion();
  
  if (prefersReducedMotion) {
    // If reduced variants are provided, use them
    // Otherwise, return empty object to disable animations
    return Object.keys(reducedVariants).length > 0 ? reducedVariants : {};
  }
  
  return fullVariants;
}

/**
 * Hook to get animation props based on reduced motion preference
 * @param {Object} animationProps - Animation properties
 * @returns {Object} Appropriate animation props
 */
export function useAnimationProps(animationProps) {
  const prefersReducedMotion = useReducedMotion();
  
  if (prefersReducedMotion) {
    // Return props without animation properties
    const { initial, animate, exit, transition, variants, ...staticProps } = animationProps;
    return staticProps;
  }
  
  return animationProps;
}