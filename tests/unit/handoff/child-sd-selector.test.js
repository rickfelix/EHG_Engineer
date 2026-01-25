/**
 * Unit tests for Child SD Selector
 *
 * Part of AUTO-PROCEED child SD continuation implementation
 *
 * Tests selecting next ready child SD from orchestrator parent
 */

// Jest provides describe, it, expect, beforeEach globally

import {
  isChildSD,
  getNextReadyChild,
  getOrchestratorContext
} from '../../../scripts/modules/handoff/child-sd-selector.js';

describe('Child SD Selector', () => {
  describe('isChildSD', () => {
    it('should return true for SD with parent_sd_id', () => {
      const sd = { id: 'child-1', parent_sd_id: 'parent-1' };
      expect(isChildSD(sd)).toBe(true);
    });

    it('should return false for SD without parent_sd_id', () => {
      const sd = { id: 'top-level-1', parent_sd_id: null };
      expect(isChildSD(sd)).toBe(false);
    });

    it('should return false for SD with undefined parent_sd_id', () => {
      const sd = { id: 'top-level-2' };
      expect(isChildSD(sd)).toBe(false);
    });

    it('should return false for null SD', () => {
      expect(isChildSD(null)).toBe(false);
    });

    it('should return false for undefined SD', () => {
      expect(isChildSD(undefined)).toBe(false);
    });
  });

  describe('getNextReadyChild', () => {
    it('should return null when no parent ID provided', async () => {
      const mockSupabase = {};
      const result = await getNextReadyChild(mockSupabase, null);

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toBe('No parent ID provided');
    });

    it('should return next ready child when one exists', async () => {
      const mockChild = {
        id: 'child-2',
        sd_key: 'SD-CHILD-002',
        title: 'Child Task 2',
        status: 'draft',
        priority: 50,
        sequence_rank: 2
      };

      const mockSupabase = {
        from: (table) => {
          if (table === 'strategic_directives_v2') {
            return {
              select: () => ({
                eq: () => ({
                  in: () => ({
                    neq: () => ({
                      order: () => ({
                        order: () => ({
                          order: () => ({
                            limit: () => Promise.resolve({ data: [mockChild], error: null })
                          })
                        })
                      })
                    })
                  })
                })
              })
            };
          }
          return {};
        }
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1', 'child-1');

      expect(result.sd).toEqual(mockChild);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toBe('Next child found');
    });

    it('should return allComplete=true when all children are completed', async () => {
      const mockSupabase = {
        from: (table) => {
          if (table === 'strategic_directives_v2') {
            return {
              select: () => ({
                eq: (field, value) => {
                  // First query: looking for ready children
                  if (field === 'parent_sd_id') {
                    return {
                      in: () => ({
                        order: () => ({
                          order: () => ({
                            order: () => ({
                              limit: () => Promise.resolve({ data: [], error: null })
                            })
                          })
                        })
                      }),
                      // Second query: getting all children
                    };
                  }
                  return {
                    in: () => ({
                      order: () => ({
                        order: () => ({
                          order: () => ({
                            limit: () => Promise.resolve({ data: [], error: null })
                          })
                        })
                      })
                    })
                  };
                }
              })
            };
          }
          return {};
        }
      };

      // Simplified mock that returns empty for ready children, then all completed
      const simpleMock = {
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                neq: () => ({
                  order: () => ({
                    order: () => ({
                      order: () => ({
                        limit: () => Promise.resolve({ data: [], error: null })
                      })
                    })
                  })
                }),
                order: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: [], error: null })
                    })
                  })
                })
              })
            })
          })
        })
      };

      // For this test, we need a mock that handles both query paths
      let queryCount = 0;
      const dualMock = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                // First query: looking for ready children (returns empty)
                return {
                  in: () => ({
                    order: () => ({
                      order: () => ({
                        order: () => ({
                          limit: () => Promise.resolve({ data: [], error: null })
                        })
                      })
                    })
                  })
                };
              } else {
                // Second query: getting all children (all completed)
                return Promise.resolve({
                  data: [
                    { id: 'c1', status: 'completed' },
                    { id: 'c2', status: 'completed' }
                  ],
                  error: null
                });
              }
            }
          })
        })
      };

      const result = await getNextReadyChild(dualMock, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(true);
    });

    it('should indicate blocked children when some are blocked', async () => {
      let queryCount = 0;
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => {
              queryCount++;
              if (queryCount === 1) {
                // First query: looking for ready children (returns empty)
                return {
                  in: () => ({
                    order: () => ({
                      order: () => ({
                        order: () => ({
                          limit: () => Promise.resolve({ data: [], error: null })
                        })
                      })
                    })
                  })
                };
              } else {
                // Second query: getting all children (some blocked)
                return Promise.resolve({
                  data: [
                    { id: 'c1', status: 'completed' },
                    { id: 'c2', status: 'blocked' },
                    { id: 'c3', status: 'blocked' }
                  ],
                  error: null
                });
              }
            }
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toContain('blocked');
    });

    it('should handle query errors gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  order: () => ({
                    order: () => ({
                      limit: () => Promise.resolve({ data: null, error: { message: 'DB error' } })
                    })
                  })
                })
              })
            })
          })
        })
      };

      const result = await getNextReadyChild(mockSupabase, 'parent-1');

      expect(result.sd).toBe(null);
      expect(result.allComplete).toBe(false);
      expect(result.reason).toContain('Query error');
    });
  });

  describe('getOrchestratorContext', () => {
    it('should return parent and children stats', async () => {
      const mockParent = {
        id: 'parent-1',
        sd_key: 'SD-PARENT-001',
        title: 'Parent Orchestrator',
        status: 'in_progress'
      };

      const mockChildren = [
        { id: 'c1', sd_key: 'SD-C1', status: 'completed' },
        { id: 'c2', sd_key: 'SD-C2', status: 'in_progress' },
        { id: 'c3', sd_key: 'SD-C3', status: 'draft' }
      ];

      const mockSupabase = {
        from: (table) => ({
          select: () => ({
            eq: () => {
              // Check if this is the parent or children query
              return {
                single: () => Promise.resolve({ data: mockParent, error: null }),
                order: () => ({
                  order: () => Promise.resolve({ data: mockChildren, error: null })
                })
              };
            }
          })
        })
      };

      const result = await getOrchestratorContext(mockSupabase, 'parent-1');

      expect(result.parent).toEqual(mockParent);
      expect(result.children).toEqual(mockChildren);
      expect(result.stats.total).toBe(3);
      expect(result.stats.completed).toBe(1);
      expect(result.stats.remaining).toBe(2);
    });

    it('should handle missing parent gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: { message: 'Not found' } })
            })
          })
        })
      };

      const result = await getOrchestratorContext(mockSupabase, 'nonexistent');

      expect(result.parent).toBe(null);
      expect(result.children).toEqual([]);
      expect(result.stats.total).toBe(0);
    });
  });
});
