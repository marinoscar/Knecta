import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useConnections } from '../../hooks/useConnections';
import type { DataConnection, CreateConnectionPayload, UpdateConnectionPayload, TestConnectionPayload } from '../../types';

describe('useConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty connections array', () => {
      const { result } = renderHook(() => useConnections());

      expect(result.current.connections).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(result.current.page).toBe(1);
      expect(result.current.pageSize).toBe(20);
      expect(result.current.totalPages).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should provide all CRUD methods', () => {
      const { result } = renderHook(() => useConnections());

      expect(typeof result.current.fetchConnections).toBe('function');
      expect(typeof result.current.createConnection).toBe('function');
      expect(typeof result.current.updateConnection).toBe('function');
      expect(typeof result.current.deleteConnection).toBe('function');
      expect(typeof result.current.testConnection).toBe('function');
      expect(typeof result.current.testNewConnection).toBe('function');
    });
  });

  describe('fetchConnections', () => {
    it('should fetch connections successfully', async () => {
      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connections).toHaveLength(1);
      expect(result.current.connections[0].name).toBe('Test PostgreSQL');
      expect(result.current.connections[0].dbType).toBe('postgresql');
      expect(result.current.total).toBe(1);
      expect(result.current.error).toBeNull();
    });

    it('should set loading state during fetch', async () => {
      const { result } = renderHook(() => useConnections());

      act(() => {
        result.current.fetchConnections();
      });

      // Should be loading immediately
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('should handle fetch errors', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.connections).toEqual([]);
    });

    it('should fetch with query parameters', async () => {
      let capturedUrl = '';
      server.use(
        http.get('*/api/connections', ({ request }) => {
          capturedUrl = request.url;
          return HttpResponse.json({
            data: {
              items: [],
              total: 0,
              page: 2,
              pageSize: 10,
              totalPages: 0,
            },
          });
        }),
      );

      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections({
          page: 2,
          pageSize: 10,
          search: 'test',
          dbType: 'postgresql',
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
      expect(capturedUrl).toContain('dbType=postgresql');
      expect(capturedUrl).toContain('sortBy=name');
      expect(capturedUrl).toContain('sortOrder=asc');
    });

    it('should update pagination state from response', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return HttpResponse.json({
            data: {
              items: [
                {
                  id: 'conn-1',
                  name: 'Connection 1',
                  description: null,
                  dbType: 'postgresql',
                  host: 'localhost',
                  port: 5432,
                  databaseName: 'db1',
                  username: 'user1',
                  hasCredential: true,
                  useSsl: false,
                  options: null,
                  lastTestedAt: null,
                  lastTestResult: null,
                  lastTestMessage: null,
                  createdAt: '2024-01-01T00:00:00.000Z',
                  updatedAt: '2024-01-01T00:00:00.000Z',
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

      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections({ page: 3, pageSize: 10 });
      });

      await waitFor(() => {
        expect(result.current.page).toBe(3);
      });

      expect(result.current.pageSize).toBe(10);
      expect(result.current.total).toBe(50);
      expect(result.current.totalPages).toBe(5);
    });
  });

  describe('createConnection', () => {
    it('should create a connection successfully', async () => {
      const { result } = renderHook(() => useConnections());

      const newConnection: CreateConnectionPayload = {
        name: 'New Connection',
        description: 'New test connection',
        dbType: 'mysql',
        host: 'localhost',
        port: 3306,
        databaseName: 'mydb',
        username: 'root',
        password: 'password',
        useSsl: false,
      };

      await act(async () => {
        await result.current.createConnection(newConnection);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should refresh the list after creation
      expect(result.current.connections).toHaveLength(1);
      expect(result.current.error).toBeNull();
    });

    it('should handle creation errors', async () => {
      server.use(
        http.post('*/api/connections', () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      const newConnection: CreateConnectionPayload = {
        name: 'Invalid Connection',
        dbType: 'postgresql',
        host: '',
        port: 0,
      };

      // The error is thrown, so we need to catch it
      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.createConnection(newConnection);
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should refresh connections list after successful creation', async () => {
      const { result } = renderHook(() => useConnections());

      // First fetch to populate the list
      await act(async () => {
        await result.current.fetchConnections();
      });

      expect(result.current.connections).toHaveLength(1);

      // Create a new connection
      const newConnection: CreateConnectionPayload = {
        name: 'Another Connection',
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
      };

      await act(async () => {
        await result.current.createConnection(newConnection);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // List should be refreshed (even if it's still 1 item due to mock)
      expect(result.current.connections).toHaveLength(1);
    });
  });

  describe('updateConnection', () => {
    it('should update a connection successfully', async () => {
      const { result } = renderHook(() => useConnections());

      // First fetch to populate the list
      await act(async () => {
        await result.current.fetchConnections();
      });

      const updates: UpdateConnectionPayload = {
        name: 'Updated Connection Name',
        description: 'Updated description',
      };

      await act(async () => {
        await result.current.updateConnection('conn-1', updates);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle update errors', async () => {
      server.use(
        http.patch('*/api/connections/:id', () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.updateConnection('nonexistent-id', {
            name: 'New Name',
          });
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should refresh connections list after successful update', async () => {
      const { result } = renderHook(() => useConnections());

      // First fetch
      await act(async () => {
        await result.current.fetchConnections();
      });

      const originalCount = result.current.connections.length;

      // Update
      await act(async () => {
        await result.current.updateConnection('conn-1', {
          name: 'Updated Name',
        });
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should still have connections (refreshed list)
      expect(result.current.connections.length).toBe(originalCount);
    });
  });

  describe('deleteConnection', () => {
    it('should delete a connection successfully', async () => {
      const { result } = renderHook(() => useConnections());

      // First fetch to populate the list
      await act(async () => {
        await result.current.fetchConnections();
      });

      await act(async () => {
        await result.current.deleteConnection('conn-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });

    it('should handle deletion errors', async () => {
      server.use(
        http.delete('*/api/connections/:id', () => {
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.deleteConnection('nonexistent-id');
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should refresh connections list after successful deletion', async () => {
      const { result } = renderHook(() => useConnections());

      // First fetch
      await act(async () => {
        await result.current.fetchConnections();
      });

      expect(result.current.connections).toHaveLength(1);

      // Delete
      await act(async () => {
        await result.current.deleteConnection('conn-1');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // List should be refreshed
      expect(result.current.connections).toHaveLength(1);
    });
  });

  describe('testConnection', () => {
    it('should test an existing connection successfully', async () => {
      const { result } = renderHook(() => useConnections());

      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection('conn-1');
      });

      expect(testResult).toEqual({
        success: true,
        message: 'Connection successful',
        latencyMs: 42,
      });
      expect(result.current.error).toBeNull();
    });

    it('should handle test connection errors', async () => {
      server.use(
        http.post('*/api/connections/:id/test', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.testConnection('conn-1');
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });

    it('should return test result with failure status', async () => {
      server.use(
        http.post('*/api/connections/:id/test', () => {
          return HttpResponse.json({
            data: {
              success: false,
              message: 'Connection timeout',
              latencyMs: 5000,
            },
          });
        }),
      );

      const { result } = renderHook(() => useConnections());

      let testResult;
      await act(async () => {
        testResult = await result.current.testConnection('conn-1');
      });

      expect(testResult).toEqual({
        success: false,
        message: 'Connection timeout',
        latencyMs: 5000,
      });
    });
  });

  describe('testNewConnection', () => {
    it('should test a new connection successfully', async () => {
      const { result } = renderHook(() => useConnections());

      const testPayload: TestConnectionPayload = {
        dbType: 'postgresql',
        host: 'localhost',
        port: 5432,
        databaseName: 'testdb',
        username: 'testuser',
        password: 'testpass',
        useSsl: false,
      };

      let testResult;
      await act(async () => {
        testResult = await result.current.testNewConnection(testPayload);
      });

      expect(testResult).toEqual({
        success: true,
        message: 'Connection successful',
        latencyMs: 42,
      });
      expect(result.current.error).toBeNull();
    });

    it('should handle test new connection errors', async () => {
      server.use(
        http.post('*/api/connections/test', () => {
          return new HttpResponse(null, { status: 400 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      const testPayload: TestConnectionPayload = {
        dbType: 'postgresql',
        host: '',
        port: 0,
      };

      let errorThrown = false;
      await act(async () => {
        try {
          await result.current.testNewConnection(testPayload);
        } catch (err) {
          errorThrown = true;
        }
      });

      expect(errorThrown).toBe(true);
      expect(result.current.error).toBeTruthy();
    });
  });

  describe('Error State Management', () => {
    it('should clear error on successful operation', async () => {
      // First, trigger an error
      server.use(
        http.get('*/api/connections', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Now, restore normal behavior
      server.resetHandlers();

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should set error state on each failed operation', async () => {
      server.use(
        http.get('*/api/connections', () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const { result } = renderHook(() => useConnections());

      await act(async () => {
        await result.current.fetchConnections();
      });

      await waitFor(() => {
        // Error message may vary based on API response
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple fetches correctly', async () => {
      const { result } = renderHook(() => useConnections());

      // Trigger multiple fetches
      await act(async () => {
        await Promise.all([
          result.current.fetchConnections({ page: 1 }),
          result.current.fetchConnections({ page: 2 }),
        ]);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should have settled on one of the results
      expect(result.current.connections).toBeDefined();
    });
  });
});
