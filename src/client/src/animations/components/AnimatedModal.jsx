import { motion, AnimatePresence } from 'framer-motion';
import { MODAL_VARIANTS } from '../constants.js';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useEffect } from 'react';

/**
 * Animated modal component with backdrop and content animations
 */
export function AnimatedModal({ 
  isOpen,
  onClose,
  children,
  className = '',
  backdropClassName = '',
  contentClassName = '',
  ...props 
}) {
  const prefersReducedMotion = useReducedMotion();
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);
  
  // If reduced motion, use simple visibility toggle
  if (prefersReducedMotion) {
    if (!isOpen) return null;
    
    return (
      <div className={`modal-container ${className}`} {...props}>
        <div 
          className={`modal-backdrop ${backdropClassName}`}
          onClick={onClose}
        />
        <div className={`modal-content ${contentClassName}`}>
          {children}
        </div>
      </div>
    );
  }
  
  return (
    <AnimatePresence>
      {isOpen && (
        <div className={`modal-container ${className}`} {...props}>
          <motion.div
            className={`modal-backdrop ${backdropClassName}`}
            variants={MODAL_VARIANTS.backdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            className={`modal-content ${contentClassName}`}
            variants={MODAL_VARIANTS.content}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}