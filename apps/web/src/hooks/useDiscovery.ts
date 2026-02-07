import { useState, useCallback } from 'react';
import type { DatabaseInfo, SchemaInfo, TableInfo } from '../types';
import {
  getConnectionDatabases,
  getConnectionSchemas,
  getConnectionTables,
} from '../services/api';

interface UseDiscoveryResult {
  databases: DatabaseInfo[];
  schemas: SchemaInfo[];
  tables: TableInfo[];
  isLoading: boolean;
  error: string | null;
  fetchDatabases: (connectionId: string) => Promise<void>;
  fetchSchemas: (connectionId: string, database: string) => Promise<void>;
  fetchTables: (connectionId: string, database: string, schema: string) => Promise<void>;
  reset: () => void;
}

export function useDiscovery(): UseDiscoveryResult {
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [schemas, setSchemas] = useState<SchemaInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDatabases = useCallback(async (connectionId: string) => {
    setIsLoading(true);
    setError(null);
    setSchemas([]);
    setTables([]);
    try {
      const result = await getConnectionDatabases(connectionId);
      setDatabases(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch databases');
      setDatabases([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSchemas = useCallback(async (connectionId: string, database: string) => {
    setIsLoading(true);
    setError(null);
    setTables([]);
    try {
      const result = await getConnectionSchemas(connectionId, database);
      setSchemas(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schemas');
      setSchemas([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTables = useCallback(async (connectionId: string, database: string, schema: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getConnectionTables(connectionId, database, schema);
      setTables(prev => [...prev, ...result]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tables');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setDatabases([]);
    setSchemas([]);
    setTables([]);
    setError(null);
  }, []);

  return {
    databases,
    schemas,
    tables,
    isLoading,
    error,
    fetchDatabases,
    fetchSchemas,
    fetchTables,
    reset,
  };
}
