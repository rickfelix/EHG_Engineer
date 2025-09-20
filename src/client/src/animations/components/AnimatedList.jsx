import { motion } from 'framer-motion';
import { STAGGER_VARIANTS } from '../constants.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

/**
 * Animated list component with staggered children animations
 */
export function AnimatedList({ 
  children, 
  className = '',
  variants = STAGGER_VARIANTS.container,
  ...props 
}) {
  const prefersReducedMotion = useReducedMotion();
  
  // If reduced motion is preferred, render static list
  if (prefersReducedMotion) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }
  
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="initial"
      animate="animate"
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Animated list item component
 */
export function AnimatedListItem({ 
  children, 
  className = '',
  variants = STAGGER_VARIANTS.item,
  ...props 
}) {
  const prefersReducedMotion = useReducedMotion();
  
  // If reduced motion is preferred, render static item
  if (prefersReducedMotion) {
    return (
      <div className={className} {...props}>
        {children}
      </div>
    );
  }
  
  return (
    <motion.div
      className={className}
      variants={variants}
      {...props}
    >
      {children}
    </motion.div>
  );
}