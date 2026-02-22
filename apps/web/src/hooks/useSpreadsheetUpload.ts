import { useState, useCallback } from 'react';
import { api } from '../services/api';
import type { SpreadsheetFile } from '../types';

export interface UploadFileProgress {
  fileName: string;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-100
  error?: string;
  file?: SpreadsheetFile;
}

interface UseSpreadsheetUploadResult {
  files: UploadFileProgress[];
  isUploading: boolean;
  error: string | null;
  uploadFiles: (projectId: string, files: File[]) => Promise<SpreadsheetFile[]>;
  reset: () => void;
}

export function useSpreadsheetUpload(): UseSpreadsheetUploadResult {
  const [files, setFiles] = useState<UploadFileProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (projectId: string, inputFiles: File[]) => {
    setIsUploading(true);
    setError(null);

    // Initialize progress tracking
    const initial: UploadFileProgress[] = inputFiles.map((f) => ({
      fileName: f.name,
      status: 'pending' as const,
      progress: 0,
    }));
    setFiles(initial);

    const results: SpreadsheetFile[] = [];

    for (let i = 0; i < inputFiles.length; i++) {
      const file = inputFiles[i];
      setFiles((prev) =>
        prev.map((p, idx) => (idx === i ? { ...p, status: 'uploading' as const, progress: 10 } : p)),
      );

      try {
        // Use existing storage upload flow: init → upload → complete
        // For now, use the simple upload endpoint via the storage module
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
        const token = api.getAccessToken();

        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectId', projectId);

        const response = await fetch(
          `${API_BASE_URL}/spreadsheet-agent/projects/${projectId}/files`,
          {
            method: 'POST',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: 'include',
            body: formData,
          },
        );

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error((errData as { message?: string }).message || `Upload failed: ${response.status}`);
        }

        const data = await response.json();
        const uploaded = (data.data ?? data) as SpreadsheetFile;

        setFiles((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'complete' as const, progress: 100, file: uploaded } : p,
          ),
        );
        results.push(uploaded);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error' as const, progress: 0, error: message } : p,
          ),
        );
      }
    }

    setIsUploading(false);
    return results;
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    setIsUploading(false);
    setError(null);
  }, []);

  return {
    files,
    isUploading,
    error,
    uploadFiles,
    reset,
  };
}
