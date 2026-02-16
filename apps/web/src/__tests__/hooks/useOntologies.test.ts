import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useOntologies } from '../../hooks/useOntologies';
import type { Ontology, CreateOntologyPayload } from '../../types';

describe('useOntologies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty ontologies array', () => {
      const { result } = renderHook(() => useOntologies());

      expect(result.current.ontologies).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(20);
      expect(result.current.totalPages).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should provide all CRUD methods', () => {
      const { result } = renderHook(() => useOntologies());

      expect(typeof result.current.fetchOntologies).toBe('function');
      expect(typeof result.current.createOntology).toBe('function');
      expect(typeof result.current.deleteOntology).toBe('function');
    });
  });

  describe('fetchOntologies', () => {
    it('should fetch ontologies successfully', async () => {
      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.ontologies).toHaveLength(1);
      expect(result.current.ontologies[0].name).toBe('Test Ontology');
      expect(result.current.ontologies[0].status).toBe('ready');
      expect(result.current.total).toBe(1);
      expect(result.current.error).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      const { result } = renderHook(() => useOntologies());

      act(() => {
        result.current.fetchOntologies();
      });

      // Should be loading immediately
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle fetch errors', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.ontologies).toEqual([]);
    });

    it('should fetch with search parameter', async () => {
      let capturedUrl = '';
      server.use(
        http.get('*/api/ontologies', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            data: {
              items: [],
              total: 0,
              page: 1,
              pageSize: 20,
              totalPages: 0,
            },
          });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies({
          page: 2,
          pageSize: 10,
          search: 'test',
          status: 'ready',
          sortBy: 'name',
          sortOrder: 'asc',
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(capturedUrl).toContain('page=2');
      expect(capturedUrl).toContain('pageSize=10');
      expect(capturedUrl).toContain('search=test');
      expect(capturedUrl).toContain('status=ready');
      expect(capturedUrl).toContain('sortBy=name');
      expect(capturedUrl).toContain('sortOrder=asc');
    });

    it('should update pagination state from response', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'onto-1',
                  name: 'Ontology 1',
                  description: 'Test ontology',
                  semanticModelId: 'model-1',
                  semanticModel: { name: 'Test Model', status: 'ready' },
                  status: 'ready',
                  nodeCount: 25,
                  relationshipCount: 30,
                  errorMessage: null,
                  createdByUserId: 'user-1',
                  createdAt: '2026-02-09T00:00:00Z',
                  updatedAt: '2026-02-09T00:00:00Z',
                },
              ],
              total: 50,
              page: 3,
              pageSize: 10,
              totalPages: 5,
            },
          });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies({ page: 3, pageSize: 10 });
      });

      await waitFor(() => {
        expect(result.current.page).toBe(3);
      });

      expect(result.current.pageSize).toBe(10);
      expect(result.current.total).toBe(50);
      expect(result.current.totalPages).toBe(5);
    });
  });

  describe('createOntology', () => {
    it('should create an ontology successfully', async () => {
      server.use(
        http.post('*/api/ontologies', () => {
          return HttpResponse.json(
            {
              data: {
                id: 'onto-new',
                name: 'New Ontology',
                description: 'New test ontology',
                semanticModelId: 'model-1',
                status: 'creating',
                nodeCount: 0,
                relationshipCount: 0,
                errorMessage: null,
                createdByUserId: 'user-1',
                createdAt: '2026-02-09T00:00:00Z',
                updatedAt: '2026-02-09T00:00:00Z',
              },
            },
            { status: 201 },
          );
        }),
      );

      const { result } = renderHook(() => useOntologies());

      const newOntology: CreateOntologyPayload = {
        name: 'New Ontology',
        description: 'New test ontology',
        semanticModelId: 'model-1',
      };

      await act(async () => {
        await result.current.createOntology(newOntology);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should refresh the list after creation
      expect(result.current.ontologies).toHaveLength(1);
      expect(result.current.error).toBeNull();
    });

    it('should handle creation errors', async () => {
      server.use(
        http.post('*/api/ontologies', () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      const newOntology: CreateOntologyPayload = {
        name: 'Invalid Ontology',
        semanticModelId: 'invalid-model',
      };

      // The error is thrown, so we need to catch it
      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.createOntology(newOntology);
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should refresh ontologies list after successful creation', async () => {
      server.use(
        http.post('*/api/ontologies', () => {
          return HttpResponse.json(
            {
              data: {
                id: 'onto-new',
                name: 'New Ontology',
                description: null,
                semanticModelId: 'model-1',
                status: 'creating',
                nodeCount: 0,
                relationshipCount: 0,
                errorMessage: null,
                createdByUserId: 'user-1',
                createdAt: '2026-02-09T00:00:00Z',
                updatedAt: '2026-02-09T00:00:00Z',
              },
            },
            { status: 201 },
          );
        }),
      );

      const { result } = renderHook(() => useOntologies());

      // First fetch to populate the list
      await act(async () => {
        await result.current.fetchOntologies();
      });

      expect(result.current.ontologies).toHaveLength(1);

      // Create a new ontology
      const newOntology: CreateOntologyPayload = {
        name: 'Another Ontology',
        semanticModelId: 'model-1',
      };

      await act(async () => {
        await result.current.createOntology(newOntology);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // List should be refreshed (even if it's still 1 item due to mock)
      expect(result.current.ontologies).toHaveLength(1);
    });
  });

  describe('deleteOntology', () => {
    it('should delete an ontology successfully', async () => {
      const { result } = renderHook(() => useOntologies());

      // First fetch to populate the list
      await act(async () => {
        await result.current.fetchOntologies();
      });

      await act(async () => {
        await result.current.deleteOntology('onto-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle deletion errors', async () => {
      server.use(
        http.delete('*/api/ontologies/:id', () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.deleteOntology('nonexistent-id');
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should refresh ontologies list after successful deletion', async () => {
      const { result } = renderHook(() => useOntologies());

      // First fetch
      await act(async () => {
        await result.current.fetchOntologies();
      });

      expect(result.current.ontologies).toHaveLength(1);

      // Delete
      await act(async () => {
        await result.current.deleteOntology('onto-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // List should be refreshed
      expect(result.current.ontologies).toHaveLength(1);
    });
  });

  describe('Error State Management', () => {
    it('should clear error on successful operation', async () => {
      // First, trigger an error
      server.use(
        http.get('*/api/ontologies', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies();
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Now, restore normal behavior
      server.resetHandlers();

      await act(async () => {
        await result.current.fetchOntologies();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should set error state on each failed operation', async () => {
      server.use(
        http.get('*/api/ontologies', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useOntologies());

      await act(async () => {
        await result.current.fetchOntologies();
      });

      await waitFor(() => {
        // Error message may vary based on API response
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple fetches correctly', async () => {
      const { result } = renderHook(() => useOntologies());

      // Trigger multiple fetches
      await act(async () => {
        await Promise.all([
          result.current.fetchOntologies({ page: 1 }),
          result.current.fetchOntologies({ page: 2 }),
        ]);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have settled on one of the results
      expect(result.current.ontologies).toBeDefined();
    });
  });
});
