import { OsiSpecService } from '../osi-spec.service';

describe('OsiSpecService', () => {
  let service: OsiSpecService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new OsiSpecService();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    service.clearCache();
  });

  describe('getSpecText', () => {
    it('should return fetched spec YAML on success', async () => {
      const mockSpec = 'OSI Spec YAML Content';
      fetchSpy.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockSpec),
        status: 200,
        statusText: 'OK',
      } as Response);

      const result = await service.getSpecText();

      expect(result).toBe(mockSpec);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // spec + schema
    });

    it('should return cached value on second call within TTL', async () => {
      const mockSpec = 'OSI Spec YAML Content';
      fetchSpy.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(mockSpec),
        status: 200,
        statusText: 'OK',
      } as Response);

      // First call
      const result1 = await service.getSpecText();
      expect(result1).toBe(mockSpec);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // spec + schema

      // Second call - should use cache
      const result2 = await service.getSpecText();
      expect(result2).toBe(mockSpec);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('should fall back to OSI_SPEC_TEXT when fetch fails (network error)', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'));

      const result = await service.getSpecText();

      // Should return the bundled spec (not empty, has content)
      expect(result).toBeTruthy();
      expect(result).toContain('semantic_model'); // OSI spec should contain this
    });

    it('should fall back to OSI_SPEC_TEXT when fetch returns non-200 status', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const result = await service.getSpecText();

      // Should return the bundled spec
      expect(result).toBeTruthy();
      expect(result).toContain('semantic_model');
    });

    it('should fall back to OSI_SPEC_TEXT when fetch times out', async () => {
      // Mock AbortError (timeout triggers abort)
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      fetchSpy.mockRejectedValue(abortError);

      const result = await service.getSpecText();

      // Should return the bundled spec
      expect(result).toBeTruthy();
      expect(result).toContain('semantic_model');
    });

    it('should force re-fetch on next call after clearCache()', async () => {
      const mockSpec1 = 'OSI Spec V1';
      const mockSpec2 = 'OSI Spec V2';

      // First fetch
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSpec1),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{}'),
        status: 200,
        statusText: 'OK',
      } as Response);

      const result1 = await service.getSpecText();
      expect(result1).toBe(mockSpec1);

      // Clear cache
      service.clearCache();

      // Second fetch should call fetch again
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSpec2),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('{}'),
        status: 200,
        statusText: 'OK',
      } as Response);

      const result2 = await service.getSpecText();
      expect(result2).toBe(mockSpec2);
      expect(fetchSpy).toHaveBeenCalledTimes(4); // 2 calls (spec+schema) per fetch
    });
  });

  describe('getSchemaJson', () => {
    it('should return null when JSON schema fetch fails', async () => {
      // Spec succeeds, schema fails
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OSI Spec YAML'),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockRejectedValueOnce(new Error('Schema fetch failed'));

      const result = await service.getSchemaJson();

      expect(result).toBeNull();
    });

    it('should return JSON schema when available', async () => {
      const mockSchema = '{"type": "object"}';
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OSI Spec YAML'),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSchema),
        status: 200,
        statusText: 'OK',
      } as Response);

      const result = await service.getSchemaJson();

      expect(result).toBe(mockSchema);
    });

    it('should return JSON schema from cache on second call', async () => {
      const mockSchema = '{"type": "object"}';
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('OSI Spec YAML'),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSchema),
        status: 200,
        statusText: 'OK',
      } as Response);

      // First call triggers fetch
      const result1 = await service.getSchemaJson();
      expect(result1).toBe(mockSchema);

      // Second call uses cache
      const result2 = await service.getSchemaJson();
      expect(result2).toBe(mockSchema);
      expect(fetchSpy).toHaveBeenCalledTimes(2); // No additional calls
    });

    it('should not prevent spec YAML from being returned when JSON schema fetch fails', async () => {
      const mockSpec = 'OSI Spec YAML';
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mockSpec),
        status: 200,
        statusText: 'OK',
      } as Response);
      fetchSpy.mockRejectedValueOnce(new Error('Schema fetch failed'));

      // getSpecText should still succeed
      const specResult = await service.getSpecText();
      expect(specResult).toBe(mockSpec);

      // getSchemaJson should return null
      const schemaResult = await service.getSchemaJson();
      expect(schemaResult).toBeNull();
    });
  });
});
