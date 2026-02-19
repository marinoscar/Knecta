/**
 * Creates a concurrency limiter that restricts how many async operations
 * run simultaneously. Similar to p-limit but without external dependencies.
 *
 * @param concurrency - Maximum number of concurrent operations
 * @returns A function that wraps promises to limit concurrency
 *
 * @example
 * const limit = createConcurrencyLimiter(3);
 * const results = await Promise.allSettled(
 *   tasks.map(task => limit(() => processTask(task)))
 * );
 */
export function createConcurrencyLimiter(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    while (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(resolve, reject).finally(() => {
          active--;
          next();
        });
      };
      queue.push(run);
      next();
    });
  };
}
