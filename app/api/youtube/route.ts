import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 複数のサーバーAPIキー（環境変数で管理）
const SERVER_API_KEYS = [
  ...(process.env.YOUTUBE_API_KEYS?.split(',').map((k) => k.trim()).filter(Boolean) ?? []),
  process.env.YOUTUBE_API_KEY,
  process.env.YOUTUBE_API_KEY_2,
  process.env.YOUTUBE_API_KEY_3,
  process.env.YOUTUBE_API_KEY_4,
  process.env.YOUTUBE_API_KEY_5,
  process.env.YOUTUBE_API_KEY_6,
  process.env.YOUTUBE_API_KEY_7,
  process.env.YOUTUBE_API_KEY_8,
  process.env.YOUTUBE_API_KEY_9,
  process.env.YOUTUBE_API_KEY_10,
].filter(Boolean) as string[];

// クォータ切れ／レート制限を広く判定（search は 429 rateLimitExceeded で返ることがある）
function isQuotaOrRateError(data: { error?: { errors?: { reason?: string }[] } }): boolean {
  const rotateReasons = ['quotaExceeded', 'rateLimitExceeded', 'dailyLimitExceeded', 'userRateLimitExceeded'];
  return data?.error?.errors?.some((e) => rotateReasons.includes(e.reason ?? '')) ?? false;
}

// --- インメモリキャッシュ ---
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6時間キャッシュ（旧30分）。ウォームなインスタンスでの再消費を抑制
const MAX_CACHE_SIZE = 500;

function getCacheKey(endpoint: string, params: URLSearchParams): string {
  const sorted = new URLSearchParams([...params.entries()].sort());
  sorted.delete('key');
  sorted.delete('userKey');
  return `${endpoint}?${sorted.toString()}`;
}

function getFromCache(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  // キャッシュサイズ上限管理
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

// --- API残量トラッキング ---
let dailyApiCalls = 0;
let lastResetDate = new Date().toDateString();

function trackApiCall(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyApiCalls = 0;
    lastResetDate = today;
  }
  dailyApiCalls++;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  // API使用状況エンドポイント
  if (endpoint === '_status') {
    return NextResponse.json({
      cacheSize: cache.size,
      dailyApiCalls,
      keyCount: SERVER_API_KEYS.length,
      cacheTtlMinutes: CACHE_TTL_MS / 60000,
    });
  }

  if (!endpoint) {
    return NextResponse.json({ error: 'endpointが必要です' }, { status: 400 });
  }

  const params = new URLSearchParams(searchParams);
  params.delete('endpoint');
  params.delete('userKey');

  if (SERVER_API_KEYS.length === 0) {
    return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
  }

  // キャッシュチェック
  const cacheKey = getCacheKey(endpoint, params);
  const cached = getFromCache(cacheKey);
  if (cached) {
    const res = NextResponse.json(cached);
    res.headers.set('X-Cache', 'HIT');
    return res;
  }

  // サーバーキーを順番に試してクォータ切れなら次へ
  let lastData: unknown = null;
  for (const key of SERVER_API_KEYS) {
    params.set('key', key);
    const youtubeUrl = `${YOUTUBE_API_BASE}/${endpoint}?${params.toString()}`;

    try {
      const response = await fetch(youtubeUrl);
      const data = await response.json();
      lastData = data;

      if (response.ok) {
        trackApiCall();
        setCache(cacheKey, data);
        const res = NextResponse.json(data);
        res.headers.set('X-Cache', 'MISS');
        return res;
      }

      // 403(quota) / 429(rate) どちらでも、quota・rate系なら次のキー/プロジェクトへ
      if ((response.status === 403 || response.status === 429) && isQuotaOrRateError(data)) {
        continue;
      }

      return NextResponse.json(data, { status: response.status });
    } catch {
      continue;
    }
  }

  // 全キーがクォータ切れ
  return NextResponse.json(
    lastData ?? { error: 'YouTube APIのクォータ制限に達しました。明日再試行してください。' },
    { status: 429 }
  );
}
