import { useState, useEffect } from 'react';
import { formatDuration } from '../components/data-agent/insightsUtils';

/**
 * Hook that provides a live elapsed timer string
 * @param startedAt - Timestamp in milliseconds when the operation started
 * @param isActive - Whether the timer should be actively ticking
 * @returns Formatted elapsed time string (e.g., "0:05", "1:32")
 */
export function useElapsedTimer(startedAt: number | null, isActive: boolean): string {
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }

    // Calculate initial elapsed time
    const updateElapsed = () => {
      const now = Date.now();
      const diff = now - startedAt;
      setElapsed(diff);
    };

    // Update immediately
    updateElapsed();

    // If active, set up interval to update every second
    if (isActive) {
      const intervalId = setInterval(updateElapsed, 1000);
      return () => clearInterval(intervalId);
    }
  }, [startedAt, isActive]);

  return formatDuration(elapsed);
}
