/**
 * localStorage ベースの TTL キャッシュ
 * YouTube API のクォータ消費を削減するために使用
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_PREFIX = 'yu-check-cache:';

export function cacheGet<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage が満杯の場合は古いキャッシュを削除してリトライ
    clearExpiredCache();
    try {
      const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
      // 容量不足は無視
    }
  }
}

export function clearExpiredCache(): void {
  if (typeof window === 'undefined') return;
  const toDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const entry: CacheEntry<unknown> = JSON.parse(raw);
          if (Date.now() > entry.expiresAt) toDelete.push(key);
        }
      } catch {
        toDelete.push(key!);
      }
    }
  }
  toDelete.forEach((k) => localStorage.removeItem(k));
}

// TTL定数
export const TTL = {
  CHANNEL_ANALYSIS: 60 * 60 * 1000,       // 1時間
  TRENDING_SEARCH:  30 * 60 * 1000,        // 30分
  VIDEO_ANALYSIS:   60 * 60 * 1000,        // 1時間
  CHANNEL_DATA:     2 * 60 * 60 * 1000,    // 2時間
} as const;
