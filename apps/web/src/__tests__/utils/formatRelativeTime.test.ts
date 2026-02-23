import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin "now" to a fixed point: 2026-02-22T12:00:00.000Z
    vi.setSystemTime(new Date('2026-02-22T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Helper: returns an ISO string that is `seconds` seconds before "now"
  function ago(seconds: number): string {
    return new Date(Date.now() - seconds * 1000).toISOString();
  }

  describe('just now — less than 60 seconds ago', () => {
    it('returns "just now" for 0 seconds ago', () => {
      expect(formatRelativeTime(ago(0))).toBe('just now');
    });

    it('returns "just now" for 1 second ago', () => {
      expect(formatRelativeTime(ago(1))).toBe('just now');
    });

    it('returns "just now" for 30 seconds ago', () => {
      expect(formatRelativeTime(ago(30))).toBe('just now');
    });

    it('returns "just now" for 59 seconds ago', () => {
      expect(formatRelativeTime(ago(59))).toBe('just now');
    });

    it('does NOT return "just now" for exactly 60 seconds ago', () => {
      expect(formatRelativeTime(ago(60))).not.toBe('just now');
    });
  });

  describe('Xm ago — less than 60 minutes ago', () => {
    it('returns "1m ago" for exactly 60 seconds ago', () => {
      expect(formatRelativeTime(ago(60))).toBe('1m ago');
    });

    it('returns "5m ago" for 5 minutes ago', () => {
      expect(formatRelativeTime(ago(5 * 60))).toBe('5m ago');
    });

    it('returns "30m ago" for 30 minutes ago', () => {
      expect(formatRelativeTime(ago(30 * 60))).toBe('30m ago');
    });

    it('returns "59m ago" for 59 minutes ago', () => {
      expect(formatRelativeTime(ago(59 * 60))).toBe('59m ago');
    });

    it('does NOT return "Xm ago" for exactly 60 minutes ago', () => {
      expect(formatRelativeTime(ago(60 * 60))).not.toMatch(/^\d+m ago$/);
    });
  });

  describe('Xh ago — less than 24 hours ago', () => {
    it('returns "1h ago" for exactly 60 minutes ago (3600 seconds)', () => {
      expect(formatRelativeTime(ago(60 * 60))).toBe('1h ago');
    });

    it('returns "2h ago" for 2 hours ago', () => {
      expect(formatRelativeTime(ago(2 * 60 * 60))).toBe('2h ago');
    });

    it('returns "12h ago" for 12 hours ago', () => {
      expect(formatRelativeTime(ago(12 * 60 * 60))).toBe('12h ago');
    });

    it('returns "23h ago" for 23 hours ago', () => {
      expect(formatRelativeTime(ago(23 * 60 * 60))).toBe('23h ago');
    });

    it('does NOT return "Xh ago" for exactly 24 hours ago', () => {
      expect(formatRelativeTime(ago(24 * 60 * 60))).not.toMatch(/^\d+h ago$/);
    });
  });

  describe('Xd ago — less than 30 days ago', () => {
    it('returns "1d ago" for exactly 24 hours ago (86400 seconds)', () => {
      expect(formatRelativeTime(ago(24 * 60 * 60))).toBe('1d ago');
    });

    it('returns "3d ago" for 3 days ago', () => {
      expect(formatRelativeTime(ago(3 * 24 * 60 * 60))).toBe('3d ago');
    });

    it('returns "7d ago" for 7 days ago', () => {
      expect(formatRelativeTime(ago(7 * 24 * 60 * 60))).toBe('7d ago');
    });

    it('returns "15d ago" for 15 days ago', () => {
      expect(formatRelativeTime(ago(15 * 24 * 60 * 60))).toBe('15d ago');
    });

    it('returns "29d ago" for 29 days ago', () => {
      expect(formatRelativeTime(ago(29 * 24 * 60 * 60))).toBe('29d ago');
    });

    it('does NOT return "Xd ago" for exactly 30 days ago', () => {
      expect(formatRelativeTime(ago(30 * 24 * 60 * 60))).not.toMatch(/^\d+d ago$/);
    });
  });

  describe('formatted date — 30 or more days ago', () => {
    it('returns a formatted short date for exactly 30 days ago', () => {
      const result = formatRelativeTime(ago(30 * 24 * 60 * 60));
      // Should NOT be a relative format
      expect(result).not.toMatch(/ago$/);
      expect(result).not.toBe('just now');
      // Should resemble a month + day format (e.g. "Jan 23")
      expect(result).toMatch(/^[A-Z][a-z]+\s\d+$/);
    });

    it('returns a formatted short date for 60 days ago', () => {
      const result = formatRelativeTime(ago(60 * 24 * 60 * 60));
      expect(result).not.toMatch(/ago$/);
      expect(result).not.toBe('just now');
      expect(result).toMatch(/^[A-Z][a-z]+\s\d+$/);
    });

    it('returns a formatted short date for 365 days ago', () => {
      const result = formatRelativeTime(ago(365 * 24 * 60 * 60));
      expect(result).not.toMatch(/ago$/);
      expect(result).not.toBe('just now');
      expect(result).toMatch(/^[A-Z][a-z]+\s\d+$/);
    });

    it('returns the correct month abbreviation for a known date', () => {
      // now = 2026-02-22T12:00:00Z; 30 days before = 2026-01-23
      const thirtyDaysAgo = ago(30 * 24 * 60 * 60);
      const result = formatRelativeTime(thirtyDaysAgo);
      expect(result).toMatch(/Jan/);
    });
  });

  describe('boundary / edge cases', () => {
    it('exact 60 seconds transitions from "just now" to "1m ago"', () => {
      // 59 seconds → still "just now"
      expect(formatRelativeTime(ago(59))).toBe('just now');
      // 60 seconds → "1m ago"
      expect(formatRelativeTime(ago(60))).toBe('1m ago');
    });

    it('exact 24 hours transitions from "Xh ago" to "1d ago"', () => {
      const justUnder24h = 24 * 60 * 60 - 1; // 86399 seconds
      expect(formatRelativeTime(ago(justUnder24h))).toBe('23h ago');
      expect(formatRelativeTime(ago(24 * 60 * 60))).toBe('1d ago');
    });

    it('exact 30 days transitions from "Xd ago" to a formatted date', () => {
      // 29 days → "29d ago"
      expect(formatRelativeTime(ago(29 * 24 * 60 * 60))).toBe('29d ago');
      // 30 days → formatted date
      const result = formatRelativeTime(ago(30 * 24 * 60 * 60));
      expect(result).not.toMatch(/ago$/);
      expect(result).not.toBe('just now');
    });
  });
});
