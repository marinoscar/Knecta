import { createConcurrencyLimiter } from '../utils/concurrency';

describe('createConcurrencyLimiter', () => {
  it('should limit concurrent executions to the specified value', async () => {
    const limit = createConcurrencyLimiter(2);
    let active = 0;
    let maxConcurrent = 0;

    const task = async () => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise(resolve => setTimeout(resolve, 20));
      active--;
    };

    // Run 5 tasks with concurrency limit of 2
    await Promise.all([
      limit(task),
      limit(task),
      limit(task),
      limit(task),
      limit(task),
    ]);

    expect(maxConcurrent).toBe(2);
  });

  it('should process all tasks even with limited concurrency', async () => {
    const limit = createConcurrencyLimiter(3);
    const results: number[] = [];

    const tasks = [1, 2, 3, 4, 5, 6, 7, 8].map(n =>
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(n);
        return n;
      })
    );

    const values = await Promise.all(tasks);

    expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(results).toHaveLength(8);
    expect(results.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should run tasks in order when concurrency is 1', async () => {
    const limit = createConcurrencyLimiter(1);
    const executionOrder: number[] = [];
    const completionOrder: number[] = [];

    const task = (id: number) => async () => {
      executionOrder.push(id);
      await new Promise(resolve => setTimeout(resolve, 5));
      completionOrder.push(id);
    };

    await Promise.all([
      limit(task(1)),
      limit(task(2)),
      limit(task(3)),
      limit(task(4)),
    ]);

    // With concurrency=1, tasks should execute and complete in order
    expect(executionOrder).toEqual([1, 2, 3, 4]);
    expect(completionOrder).toEqual([1, 2, 3, 4]);
  });

  it('should handle rejected promises without blocking the queue', async () => {
    const limit = createConcurrencyLimiter(2);
    const results: string[] = [];

    const successTask = (id: number) => async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      results.push(`success-${id}`);
      return `success-${id}`;
    };

    const failTask = (id: number) => async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      throw new Error(`fail-${id}`);
    };

    const allResults = await Promise.allSettled([
      limit(successTask(1)),
      limit(failTask(2)),
      limit(successTask(3)),
      limit(failTask(4)),
      limit(successTask(5)),
    ]);

    // Check that successful tasks completed
    expect(results).toEqual(['success-1', 'success-3', 'success-5']);

    // Check that we got the expected mix of fulfilled and rejected
    const fulfilled = allResults.filter(r => r.status === 'fulfilled');
    const rejected = allResults.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(2);

    // Check rejection reasons
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe('fail-2');
    expect((rejected[1] as PromiseRejectedResult).reason.message).toBe('fail-4');
  });

  it('should handle concurrency greater than task count', async () => {
    const limit = createConcurrencyLimiter(10);
    let active = 0;
    let maxConcurrent = 0;

    const task = async () => {
      active++;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise(resolve => setTimeout(resolve, 15));
      active--;
    };

    // Run only 3 tasks with concurrency limit of 10
    await Promise.all([
      limit(task),
      limit(task),
      limit(task),
    ]);

    // All 3 should run concurrently
    expect(maxConcurrent).toBe(3);
  });

  it('should handle zero delay tasks correctly', async () => {
    const limit = createConcurrencyLimiter(2);
    const results: number[] = [];

    const tasks = [1, 2, 3, 4, 5].map(n =>
      limit(async () => {
        // No delay, immediate execution
        results.push(n);
        return n;
      })
    );

    await Promise.all(tasks);

    expect(results).toHaveLength(5);
    expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle tasks with different execution times', async () => {
    const limit = createConcurrencyLimiter(2);
    const results: string[] = [];

    await Promise.all([
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('slow-1');
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('fast-1');
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push('fast-2');
      }),
      limit(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        results.push('slow-2');
      }),
    ]);

    expect(results).toHaveLength(4);
    // Fast tasks should complete before slow tasks
    expect(results.indexOf('fast-1')).toBeLessThan(results.indexOf('slow-1'));
    expect(results.indexOf('fast-2')).toBeLessThan(results.indexOf('slow-2'));
  });
});
