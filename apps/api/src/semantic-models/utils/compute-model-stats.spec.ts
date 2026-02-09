import { computeModelStats } from './compute-model-stats';

describe('computeModelStats', () => {
  it('should return all zeros for empty/null model', () => {
    const result = computeModelStats({});
    expect(result).toEqual({
      tableCount: 0,
      fieldCount: 0,
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should return all zeros for null model', () => {
    const result = computeModelStats(null as any);
    expect(result).toEqual({
      tableCount: 0,
      fieldCount: 0,
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should return all zeros for model without semantic_model', () => {
    const result = computeModelStats({ some: 'data' });
    expect(result).toEqual({
      tableCount: 0,
      fieldCount: 0,
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should count datasets, fields, relationships, and metrics correctly', () => {
    const model = {
      semantic_model: [
        {
          name: 'Test Model',
          datasets: [
            {
              name: 'orders',
              fields: [
                { name: 'id' },
                { name: 'total' },
                { name: 'status' },
              ],
            },
            {
              name: 'customers',
              fields: [{ name: 'id' }, { name: 'name' }],
            },
            {
              name: 'products',
              fields: [{ name: 'id' }],
            },
          ],
          relationships: [
            { name: 'orders_customers' },
            { name: 'orders_products' },
          ],
          metrics: [
            { name: 'total_revenue' },
            { name: 'order_count' },
            { name: 'avg_order_value' },
          ],
        },
      ],
    };

    const result = computeModelStats(model);

    expect(result).toEqual({
      tableCount: 3, // 3 datasets
      fieldCount: 6, // 3 + 2 + 1 fields
      relationshipCount: 2,
      metricCount: 3,
    });
  });

  it('should handle datasets without fields', () => {
    const model = {
      semantic_model: [
        {
          name: 'Test Model',
          datasets: [
            { name: 'orders', fields: [] },
            { name: 'customers' }, // no fields property
            { name: 'products', fields: [{ name: 'id' }] },
          ],
          relationships: [],
          metrics: [],
        },
      ],
    };

    const result = computeModelStats(model);

    expect(result).toEqual({
      tableCount: 3,
      fieldCount: 1, // only products has 1 field
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should return zeros for relationships/metrics when not present', () => {
    const model = {
      semantic_model: [
        {
          name: 'Test Model',
          datasets: [
            {
              name: 'orders',
              fields: [{ name: 'id' }, { name: 'total' }],
            },
          ],
          // No relationships or metrics
        },
      ],
    };

    const result = computeModelStats(model);

    expect(result).toEqual({
      tableCount: 1,
      fieldCount: 2,
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should handle model with empty datasets array', () => {
    const model = {
      semantic_model: [
        {
          name: 'Test Model',
          datasets: [],
          relationships: [],
          metrics: [],
        },
      ],
    };

    const result = computeModelStats(model);

    expect(result).toEqual({
      tableCount: 0,
      fieldCount: 0,
      relationshipCount: 0,
      metricCount: 0,
    });
  });

  it('should handle model with empty semantic_model array', () => {
    const model = {
      semantic_model: [],
    };

    const result = computeModelStats(model);

    expect(result).toEqual({
      tableCount: 0,
      fieldCount: 0,
      relationshipCount: 0,
      metricCount: 0,
    });
  });
});
