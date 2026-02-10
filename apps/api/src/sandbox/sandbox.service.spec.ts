import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxService, ExecutionResult } from './sandbox.service';

// Mock global fetch
global.fetch = jest.fn();

describe('SandboxService', () => {
  let service: SandboxService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue('http://sandbox:8000'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCode', () => {
    it('should return execution result on success', async () => {
      const mockResult: ExecutionResult = {
        stdout: 'Hello, World!',
        stderr: '',
        returnCode: 0,
        files: [],
        executionTimeMs: 123,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.executeCode('print("Hello, World!")');

      expect(result).toEqual(mockResult);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://sandbox:8000/execute',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'print("Hello, World!")', timeout: 30 }),
        }),
      );
    });

    it('should return stdout and files', async () => {
      const mockResult: ExecutionResult = {
        stdout: 'Success',
        stderr: '',
        returnCode: 0,
        files: [
          {
            name: 'output.png',
            base64: 'iVBORw0KGgo...',
            mimeType: 'image/png',
          },
        ],
        executionTimeMs: 456,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResult),
      });

      const result = await service.executeCode('import matplotlib; ...');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].mimeType).toBe('image/png');
      expect(result.stdout).toBe('Success');
    });

    it('should throw error on HTTP error', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        text: jest.fn().mockResolvedValue('Internal server error'),
      });

      await expect(service.executeCode('invalid code')).rejects.toThrow(
        'Sandbox execution failed (500): Internal server error',
      );
    });

    it('should throw error on timeout', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        });
      });

      await expect(service.executeCode('import time; time.sleep(100)', 1)).rejects.toThrow(
        /Sandbox execution timed out/,
      );
    });

    it('should use custom timeout', async () => {
      const mockResult: ExecutionResult = {
        stdout: 'Done',
        stderr: '',
        returnCode: 0,
        files: [],
        executionTimeMs: 5000,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResult),
      });

      await service.executeCode('time.sleep(5)', 10);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ code: 'time.sleep(5)', timeout: 10 }),
        }),
      );
    });
  });

  describe('isHealthy', () => {
    it('should return true when sandbox is healthy', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
      });

      const result = await service.isHealthy();

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://sandbox:8000/health',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('should return false on error', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });

    it('should return false on non-ok response', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });
  });
});
