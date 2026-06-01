import { VideoData, VideoWithMetrics, ChannelResult, DateRange } from '@/types';
import { calculateChannelScore, analyzePostingTimes } from '@/lib/analysis';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';
import { getActiveApiKey, markKeyExhausted, getNextApiKey } from '@/lib/apiKeyManager';

const YOUTUBE_API_BASE = '/api/youtube';
const SHORT_VIDEO_THRESHOLD = 180; // 3分 = 180秒
const VIRAL_THRESHOLD = 2.5; // チャンネル内平均の2.5倍以上

export function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatNumber(num: number): string {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}億`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toLocaleString('ja-JP');
}

/** 日付範囲を ISO 8601 文字列に変換 */
export function dateRangeToISO(range: DateRange): string | undefined {
  if (range === 'all') return undefined;
  const daysMap: Record<string, number> = {
    '1month': 30,
    '3months': 90,
    '6months': 180,
    '1year': 365,
  };
  const days = daysMap[range];
  return new Date(Date.now() - days * 86400000).toISOString();
}

/**
 * キーローテーション付きフェッチ
 * ユーザーAPIキーが登録されている場合はそれを優先し、
 * クォータ切れ時は次のキーに自動切り替え
 */
async function fetchWithKeyRotation(apiUrl: string, userKey: string | null): Promise<Response> {
  const params = new URLSearchParams(apiUrl.split('?')[1]);
  if (userKey) params.set('userKey', userKey);
  const fullUrl = `${apiUrl.split('?')[0]}?${params.toString()}`;
  return fetch(fullUrl);
}

async function fetchWithErrorHandling(url: string) {
  // /api/youtube?endpoint=xxx&... の形式に変換
  const urlObj = new URL(url, 'http://localhost');
  const endpoint = urlObj.pathname.replace('/api/youtube/', '');
  const params = new URLSearchParams(urlObj.search);
  params.set('endpoint', endpoint);
  const baseApiUrl = `${YOUTUBE_API_BASE}?${params.toString()}`;

  // キャッシュチェック（GETリクエストのみ）
  const cacheKey = baseApiUrl;
  const cached = cacheGet<unknown>(cacheKey);
  if (cached !== null) return cached;

  // アクティブなAPIキーを取得（ない場合は null → サーバー側の env キーを使用）
  let userKey = getActiveApiKey();
  let attempts = 0;
  const maxAttempts = 5; // 最大キー試行数

  while (attempts < maxAttempts) {
    attempts++;
    const response = await fetchWithKeyRotation(baseApiUrl, userKey);
    const data = await response.json();

    if (!response.ok) {
      const errorReason = data?.error?.errors?.[0]?.reason;

      if (errorReason === 'quotaExceeded') {
        if (userKey) {
          // このキーを枯渇済みとしてマーク
          markKeyExhausted(userKey);
          // 次のキーを試す
          const nextKey = getNextApiKey(userKey);
          if (nextKey) {
            userKey = nextKey;
            continue;
          }
        }
        throw new Error('YouTube APIのクォータ制限に達しました。設定でAPIキーを追加するか、明日再試行してください。');
      } else if (errorReason === 'keyInvalid') {
        if (userKey) {
          markKeyExhausted(userKey);
          const nextKey = getNextApiKey(userKey);
          if (nextKey) { userKey = nextKey; continue; }
        }
        throw new Error('APIキーが無効です。設定でAPIキーを確認してください。');
      }
      throw new Error(`API呼び出しエラー: ${data?.error?.message || response.statusText}`);
    }

    // 成功 → キャッシュ保存
    const ttl = endpoint.startsWith('search') ? TTL.TRENDING_SEARCH
      : endpoint.startsWith('channels') ? TTL.CHANNEL_DATA
      : TTL.CHANNEL_ANALYSIS;
    cacheSet(cacheKey, data, ttl);

    return data;
  }

  throw new Error('利用可能なAPIキーがありません。設定でAPIキーを追加してください。');
}

export async function fetchChannelData(
  channelId: string
): Promise<{ channelTitle: string; subscriberCount: number; actualChannelId: string }> {
  let url: string;

  if (channelId.startsWith('@')) {
    const handle = channelId.substring(1);
    url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}`;
  } else if (channelId.startsWith('UC') || channelId.length === 24) {
    url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelId}`;
  } else {
    url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&forUsername=${encodeURIComponent(channelId)}`;
  }

  const data = await fetchWithErrorHandling(url);

  if (!data.items || data.items.length === 0) {
    throw new Error(`チャンネルが見つかりません: ${channelId}`);
  }

  const channel = data.items[0];
  return {
    channelTitle: channel.snippet.title,
    subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
    actualChannelId: channel.id,
  };
}

/**
 * チャンネルIDからアップロード済み動画プレイリストIDを導出（UC... → UU...）
 * どのチャンネルも uploads プレイリストID = チャンネルIDの先頭 UC を UU に置換したもの。
 */
function uploadsPlaylistId(channelId: string): string | null {
  if (channelId.startsWith('UC') && channelId.length === 24) {
    return 'UU' + channelId.slice(2);
  }
  return null;
}

/**
 * チャンネルの最近動画IDを uploads プレイリストから取得する。
 * playlistItems.list は 1ユニット/ページ（search.list の 100ユニットの 1/100）。
 * uploads プレイリストは新しい順で返るため、publishedAfter 指定時は
 * 期間外（古い）動画に達した時点で打ち切る。
 */
async function fetchUploadVideoIds(
  channelId: string,
  maxResults: number,
  publishedAfter?: string
): Promise<string[]> {
  const playlistId = uploadsPlaylistId(channelId);
  if (!playlistId) return [];

  const ids: string[] = [];
  let pageToken = '';
  const afterMs = publishedAfter ? new Date(publishedAfter).getTime() : null;

  while (ids.length < maxResults) {
    const batchSize = Math.min(maxResults - ids.length, 50);
    let url = `${YOUTUBE_API_BASE}/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${batchSize}`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    let data: { items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[]; nextPageToken?: string };
    try {
      data = await fetchWithErrorHandling(url) as typeof data;
    } catch {
      break; // プレイリスト非公開・存在しない等
    }
    if (!data.items || data.items.length === 0) break;

    let reachedOld = false;
    for (const item of data.items) {
      const vid = item.contentDetails?.videoId;
      const publishedAt = item.contentDetails?.videoPublishedAt;
      if (!vid) continue;
      if (afterMs && publishedAt && new Date(publishedAt).getTime() < afterMs) {
        reachedOld = true; // 新しい順なので、これ以降は全部期間外
        continue;
      }
      ids.push(vid);
    }
    if (reachedOld) break;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return ids;
}

export async function fetchRecentVideos(
  channelId: string,
  maxResults: number = 50,
  publishedAfter?: string
): Promise<VideoData[]> {
  // uploads プレイリストから動画IDを取得（playlistItems=1u, 旧 search=100u の置換）
  const videoIds = await fetchUploadVideoIds(channelId, maxResults, publishedAfter);

  if (videoIds.length === 0) return [];

  // 50件ずつ動画詳細を取得
  const allVideoDetails = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batchIds = videoIds.slice(i, i + 50).join(',');
    const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${batchIds}`;
    const videosData = await fetchWithErrorHandling(videosUrl);
    // 生配信アーカイブを除外
    const filtered = (videosData.items || []).filter((v: { liveStreamingDetails?: unknown }) => !v.liveStreamingDetails);
    allVideoDetails.push(...filtered);
  }

  const rawVideos = allVideoDetails.map((video: {
    id: string;
    snippet: {
      title: string;
      publishedAt: string;
      thumbnails: { medium: { url: string } };
      channelTitle: string;
      channelId: string;
    };
    contentDetails: { duration: string };
    statistics: {
      viewCount: string;
      likeCount?: string;
      commentCount?: string;
    };
  }) => {
    const publishedAt = video.snippet.publishedAt;
    const jstDate = new Date(new Date(publishedAt).getTime() + 9 * 60 * 60 * 1000);
    const publishHour = jstDate.getUTCHours();
    const publishDayOfWeek = jstDate.getUTCDay();

    return {
      videoId: video.id,
      title: video.snippet.title,
      publishedAt,
      duration: parseDuration(video.contentDetails.duration),
      viewCount: parseInt(video.statistics.viewCount) || 0,
      likeCount: parseInt(video.statistics.likeCount || '0') || 0,
      commentCount: parseInt(video.statistics.commentCount || '0') || 0,
      thumbnailUrl: video.snippet.thumbnails.medium?.url || '',
      channelName: video.snippet.channelTitle,
      channelId: video.snippet.channelId,
      subscriberCount: 0,
      publishHour,
      publishDayOfWeek,
      isViral: false,
    };
  });

  const totalViews = rawVideos.reduce((sum, v) => sum + v.viewCount, 0);
  const avgViews = rawVideos.length > 0 ? totalViews / rawVideos.length : 0;

  return rawVideos
    .map((v) => ({
      ...v,
      isViral: avgViews > 0 && v.viewCount >= avgViews * VIRAL_THRESHOLD,
    }))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function categorizeVideos(videos: VideoData[]): {
  shortVideos: VideoData[];
  longVideos: VideoData[];
} {
  const shortVideos: VideoData[] = [];
  const longVideos: VideoData[] = [];

  videos.forEach((video) => {
    if (video.duration <= SHORT_VIDEO_THRESHOLD) {
      shortVideos.push(video);
    } else {
      longVideos.push(video);
    }
  });

  return { shortVideos, longVideos };
}

export function calculateMetricsForChannel(
  videos: VideoData[],
  videoType: 'long' | 'short'
): VideoWithMetrics[] {
  if (!videos || videos.length === 0) return [];

  const recent10 = videos.slice(0, Math.min(10, videos.length));
  const recent10Views = recent10.map((v) => v.viewCount);
  const averageViews =
    recent10Views.reduce((sum, v) => sum + v, 0) / recent10Views.length;
  const minViews = Math.min(...recent10Views);
  const maxViews = Math.max(...recent10Views);

  const videosWithMetrics: VideoWithMetrics[] = videos.map((video) => {
    let engagementRate: number;

    if (videoType === 'short') {
      engagementRate =
        averageViews > 0 ? (video.viewCount / averageViews) * 100 : 0;
    } else {
      engagementRate =
        video.subscriberCount > 0
          ? (video.viewCount / video.subscriberCount) * 100
          : 0;
    }

    const diffFromAverage =
      averageViews > 0
        ? ((video.viewCount - averageViews) / averageViews) * 100
        : 0;

    return {
      ...video,
      rank: 0,
      engagementRate,
      videoType,
      averageViews: Math.round(averageViews),
      minViews,
      maxViews,
      diffFromAverage,
    };
  });

  videosWithMetrics.sort((a, b) => b.viewCount - a.viewCount);
  videosWithMetrics.forEach((video, index) => {
    video.rank = index + 1;
  });

  return videosWithMetrics;
}

export async function analyzeChannel(
  channelId: string,
  maxVideos: number = 30,
  dateRange?: DateRange
): Promise<ChannelResult> {
  const channelData = await fetchChannelData(channelId);

  // 期間指定がある場合は全件取得、ない場合は本数×6
  let fetchCount: number;
  let publishedAfter: string | undefined;

  if (dateRange && dateRange !== 'all') {
    publishedAfter = dateRangeToISO(dateRange);
    fetchCount = 500; // 期間内を全件取得
  } else {
    fetchCount = Math.min(maxVideos * 6, 300);
  }

  const videos = await fetchRecentVideos(channelData.actualChannelId, fetchCount, publishedAfter);

  videos.forEach((v) => {
    v.subscriberCount = channelData.subscriberCount;
    v.channelName = channelData.channelTitle;
  });

  const { longVideos, shortVideos } = categorizeVideos(videos);

  // 期間指定時は全件表示（maxVideosはdisplayLimitで制御）
  // 期間なし時は maxVideos でカット
  const longVideosSliced = dateRange && dateRange !== 'all' ? longVideos : longVideos.slice(0, maxVideos);
  const shortVideosSliced = dateRange && dateRange !== 'all' ? shortVideos : shortVideos.slice(0, maxVideos);

  const scoreBreakdown = calculateChannelScore(videos, channelData.subscriberCount);
  const postingAnalysis = analyzePostingTimes(videos);

  return {
    channelId,
    channelName: channelData.channelTitle,
    subscriberCount: channelData.subscriberCount,
    longVideos: calculateMetricsForChannel(longVideosSliced, 'long'),
    shortVideos: calculateMetricsForChannel(shortVideosSliced, 'short'),
    scoreBreakdown,
    postingAnalysis,
  };
}

// ============================================================
// 穴場キーワード探索
// ============================================================

export interface TrendingVideo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  thumbnailUrl: string;
  viewsPerDay: number;
  daysOld: number;
  subscriberCount?: number;
}

// ============================================================
// 個別動画分析
// ============================================================

export interface RecentVideoPoint {
  videoId: string;
  title: string;
  viewCount: number;
  publishedAt: string;
  isTarget: boolean; // 分析対象の動画かどうか
}

export interface VideoAnalysisData {
  videoId: string;
  title: string;
  description: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  duration: number;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  likeRate: number;
  commentRate: number;
  publishHour: number;
  publishDayOfWeek: number;
  channelAvgViews: number;
  channelMedianViews: number;
  channelVideoCount: number;
  diffFromAvg: number;
  channelRank: number;
  recentVideos: RecentVideoPoint[]; // チャンネルの直近動画一覧（推移グラフ用）
}

export function extractVideoId(input: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^&]+&)*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /^([A-Za-z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = input.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

export async function fetchVideoAnalysis(urlOrId: string, compareCount: number = 30): Promise<VideoAnalysisData> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) throw new Error('有効なYouTube URLまたは動画IDを入力してください');

  const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${videoId}`;
  const videoData = await fetchWithErrorHandling(videoUrl);

  if (!videoData.items || videoData.items.length === 0) {
    throw new Error('動画が見つかりません。URLを確認してください。');
  }

  const v = videoData.items[0];
  const channelId = v.snippet.channelId;
  const viewCount = parseInt(v.statistics.viewCount) || 0;
  const likeCount = parseInt(v.statistics.likeCount || '0') || 0;
  const commentCount = parseInt(v.statistics.commentCount || '0') || 0;
  const duration = parseDuration(v.contentDetails.duration);
  const publishedAt = v.snippet.publishedAt;

  const jstDate = new Date(new Date(publishedAt).getTime() + 9 * 60 * 60 * 1000);
  const publishHour = jstDate.getUTCHours();
  const publishDayOfWeek = jstDate.getUTCDay();

  const thumbnailUrl =
    v.snippet.thumbnails?.maxres?.url ||
    v.snippet.thumbnails?.high?.url ||
    v.snippet.thumbnails?.medium?.url || '';

  // 同チャンネルの直近N本で比較
  const recentVideos = await fetchRecentVideos(channelId, compareCount);
  const recentViewCounts = recentVideos.map((r) => r.viewCount).filter((c) => c > 0);

  let channelAvgViews = 0;
  let channelMedianViews = 0;
  let diffFromAvg = 0;
  let channelRank = 0;

  if (recentViewCounts.length > 0) {
    channelAvgViews = Math.round(recentViewCounts.reduce((s, c) => s + c, 0) / recentViewCounts.length);
    const sorted = [...recentViewCounts].sort((a, b) => b - a);
    channelMedianViews = sorted[Math.floor(sorted.length / 2)];
    diffFromAvg = channelAvgViews > 0 ? ((viewCount - channelAvgViews) / channelAvgViews) * 100 : 0;
    channelRank = sorted.findIndex((c) => viewCount >= c) + 1;
  }

  // 直近動画一覧（推移グラフ用）- 古い順にソート
  const recentVideoPoints: RecentVideoPoint[] = [...recentVideos]
    .sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime())
    .map((r) => ({
      videoId: r.videoId,
      title: r.title,
      viewCount: r.viewCount,
      publishedAt: r.publishedAt,
      isTarget: r.videoId === videoId,
    }));

  // 分析対象動画がrecentVideosに含まれていない場合は追加
  if (!recentVideoPoints.find((p) => p.isTarget)) {
    recentVideoPoints.push({
      videoId,
      title: v.snippet.title,
      viewCount,
      publishedAt,
      isTarget: true,
    });
    recentVideoPoints.sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  }

  return {
    videoId,
    title: v.snippet.title,
    description: v.snippet.description || '',
    channelId,
    channelName: v.snippet.channelTitle,
    publishedAt,
    duration,
    thumbnailUrl,
    viewCount,
    likeCount,
    commentCount,
    likeRate: viewCount > 0 ? likeCount / viewCount : 0,
    commentRate: viewCount > 0 ? commentCount / viewCount : 0,
    publishHour,
    publishDayOfWeek,
    channelAvgViews,
    channelMedianViews,
    channelVideoCount: recentVideos.length,
    diffFromAvg,
    channelRank,
    recentVideos: recentVideoPoints,
  };
}

// ============================================================
// コメント取得・分析
// ============================================================

export interface VideoComment {
  authorName: string;
  text: string;
  likeCount: number;
  publishedAt: string;
}

export interface CommentAnalysis {
  totalFetched: number;
  topLikedComments: VideoComment[];
  questionComments: VideoComment[];
  requestComments: VideoComment[];
  frequentWords: { word: string; count: number }[];
}

export async function fetchVideoComments(videoId: string, maxResults: number = 100): Promise<VideoComment[]> {
  const comments: VideoComment[] = [];
  let pageToken = '';
  let remaining = maxResults;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, 100);
    let url = `${YOUTUBE_API_BASE}/commentThreads?part=snippet&videoId=${videoId}&maxResults=${batchSize}&order=relevance&textFormat=plainText`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    try {
      const data = await fetchWithErrorHandling(url);
      if (!data.items || data.items.length === 0) break;

      for (const item of data.items) {
        const s = item.snippet.topLevelComment.snippet;
        comments.push({
          authorName: s.authorDisplayName || '',
          text: s.textDisplay || '',
          likeCount: parseInt(s.likeCount || '0') || 0,
          publishedAt: s.publishedAt || '',
        });
      }

      remaining -= data.items.length;
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    } catch {
      // コメント無効化されているチャンネルもあるので、エラーは無視
      break;
    }
  }

  return comments;
}

/** コメントを分析してカテゴリ分けする */
export function analyzeComments(comments: VideoComment[]): CommentAnalysis {
  // いいね順トップ10
  const topLiked = [...comments].sort((a, b) => b.likeCount - a.likeCount).slice(0, 10);

  // 質問コメント（?を含む）
  const questionPatterns = /[?？]|教えて|知りたい|どう(やって|すれば|したら)|なぜ|なんで|どこで|いつ/;
  const questionComments = comments
    .filter(c => questionPatterns.test(c.text))
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 10);

  // リクエスト・要望コメント
  const requestPatterns = /して(ほしい|欲しい|ください)|お願い|リクエスト|取り上げて|やって(みて|ほしい)|紹介して|解説して|出して|待って(ます|います)|次[はも]|続き/;
  const requestComments = comments
    .filter(c => requestPatterns.test(c.text))
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 10);

  // 頻出ワード（2文字以上の名詞的ワード抽出）
  const stopWords = new Set([
    'これ', 'それ', 'あれ', 'この', 'その', 'あの', 'ここ', 'そこ', 'あそこ',
    'もの', 'こと', 'とき', 'ところ', 'ため', 'よう', 'ほう', 'わけ', 'はず',
    'です', 'ます', 'した', 'する', 'される', 'なる', 'ある', 'いる', 'できる',
    'ない', 'なかった', 'けど', 'から', 'ので', 'でも', 'だけ', 'まで', 'より',
    'って', 'という', 'ている', 'てる', 'ました', 'ません', 'ですね', 'ですが',
    'ですよ', 'ですか', 'ますか', 'ますね', 'ますよ', 'ありがとう', 'ございます',
    'www', 'ww', '笑笑', 'hhh', 'おお', 'すごい', 'すごく', 'とても', 'めっちゃ',
    'やっぱり', 'やはり', 'やっぱ', '本当に', 'ほんとに', 'マジで', '動画',
    '自分', 'みたい', 'そう', 'ちょっと', 'かなり', '思い', '思う', '感じ',
  ]);

  const wordCount = new Map<string, number>();
  for (const c of comments) {
    // カタカナ語、漢字語を抽出（2文字以上）
    const words = c.text.match(/[\u30A0-\u30FF]{2,}|[\u4E00-\u9FFF]{2,}|[A-Za-z]{3,}/g) || [];
    const seen = new Set<string>();
    for (const w of words) {
      const lower = w.toLowerCase();
      if (stopWords.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      wordCount.set(lower, (wordCount.get(lower) || 0) + 1);
    }
  }

  const frequentWords = [...wordCount.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));

  return {
    totalFetched: comments.length,
    topLikedComments: topLiked,
    questionComments,
    requestComments,
    frequentWords,
  };
}

export type TrendSearchRange = '1week' | '2weeks' | '1month' | '3months';

export function trendRangeToISO(range: TrendSearchRange): string {
  const daysMap: Record<TrendSearchRange, number> = {
    '1week': 7,
    '2weeks': 14,
    '1month': 30,
    '3months': 90,
  };
  return new Date(Date.now() - daysMap[range] * 86400000).toISOString();
}

export async function searchTrendingVideos(
  query: string,
  dateRange: TrendSearchRange = '1month',
  language: 'ja' | 'en' | 'all' = 'ja',
  maxResults: number = 50
): Promise<TrendingVideo[]> {
  const publishedAfter = trendRangeToISO(dateRange);
  const searchItems: { id: { videoId: string } }[] = [];
  let pageToken = '';
  let remaining = maxResults;

  // 言語に対応するregionCodeを設定
  const regionCode = language === 'ja' ? 'JP' : language === 'en' ? 'US' : undefined;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, 50);
    let searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&publishedAfter=${encodeURIComponent(publishedAfter)}&maxResults=${batchSize}&order=viewCount`;
    if (language !== 'all') searchUrl += `&relevanceLanguage=${language}`;
    if (regionCode) searchUrl += `&regionCode=${regionCode}`;
    if (pageToken) searchUrl += `&pageToken=${pageToken}`;

    const data = await fetchWithErrorHandling(searchUrl);
    if (!data.items || data.items.length === 0) break;

    searchItems.push(...data.items);
    remaining -= data.items.length;
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  if (searchItems.length === 0) return [];

  const now = Date.now();
  const allVideos: TrendingVideo[] = [];

  for (let i = 0; i < searchItems.length; i += 50) {
    const batch = searchItems.slice(i, i + 50);
    const videoIds = batch.map((item: { id: { videoId: string } }) => item.id.videoId).join(',');
    const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${videoIds}`;
    const videosData = await fetchWithErrorHandling(videosUrl);

    // 生配信アーカイブを除外
    const filteredItems = (videosData.items || []).filter((v: { liveStreamingDetails?: unknown }) => !v.liveStreamingDetails);

    filteredItems.forEach((video: {
      id: string;
      snippet: {
        title: string;
        publishedAt: string;
        thumbnails: { medium: { url: string } };
        channelTitle: string;
        channelId: string;
      };
      contentDetails: { duration: string };
      statistics: {
        viewCount: string;
        likeCount?: string;
        commentCount?: string;
      };
    }) => {
      const publishedMs = new Date(video.snippet.publishedAt).getTime();
      const daysOld = Math.max(1, (now - publishedMs) / 86400000);
      const viewCount = parseInt(video.statistics.viewCount) || 0;

      allVideos.push({
        videoId: video.id,
        title: video.snippet.title,
        channelName: video.snippet.channelTitle,
        channelId: video.snippet.channelId,
        publishedAt: video.snippet.publishedAt,
        viewCount,
        likeCount: parseInt(video.statistics.likeCount || '0') || 0,
        commentCount: parseInt(video.statistics.commentCount || '0') || 0,
        duration: parseDuration(video.contentDetails.duration),
        thumbnailUrl: video.snippet.thumbnails.medium?.url || '',
        viewsPerDay: Math.round(viewCount / daysOld),
        daysOld: Math.floor(daysOld),
      });
    });
  }

  // クライアント側で言語フィルタリング（APIのhintだけでは不十分なため）
  const filtered = language === 'all' ? allVideos : allVideos.filter((v) => {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uFF00-\uFFEF]/.test(v.title);
    return language === 'ja' ? hasJapanese : !hasJapanese;
  });

  return filtered.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
}

// ============================================================
// 穴場チャンネル検索（キーワードからチャンネルを発見）
// ============================================================

export interface ChannelTopVideo {
  videoId: string;
  title: string;
  viewCount: number;
  thumbnailUrl: string;
  duration: number; // 秒数
  efficiency: number; // 登録者あたり再生率 (viewCount / subscriberCount * 100)
}

export interface DiscoveredChannel {
  channelId: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  subscriberCount: number;
  totalViewCount: number;
  videoCount: number;
  publishedAt: string;
  isSubscriberHidden: boolean;
  // 算出値
  avgViewsPerVideo: number;
  recentAvgViews: number;
  recentMaxViews: number;
  recentEfficiency: number; // 直近平均再生 / 登録者数 * 100
  buzzRatio: number; // 直近最大 / 直近平均
  growthRate: number; // 登録者 / チャンネル日数
  channelAgeDays: number;
  topVideo: ChannelTopVideo | null; // 登録者あたり最も伸びてる動画（全体）
  topVideoLong: ChannelTopVideo | null; // ロング動画で最も伸びてる
  topVideoShort: ChannelTopVideo | null; // ショート動画で最も伸びてる
}

export type ChannelSortKey =
  | 'subscriberCount_asc'
  | 'subscriberCount_desc'
  | 'totalViewCount_desc'
  | 'recentAvgViews_desc'
  | 'buzzRatio_desc'
  | 'channelAge_asc'
  | 'channelAge_desc';

/** チャンネルIDリストから DiscoveredChannel[] を構築するヘルパー */
async function buildDiscoveredChannels(
  channelIdList: string[]
): Promise<DiscoveredChannel[]> {
  if (channelIdList.length === 0) return [];

  const now = Date.now();
  const allChannels: DiscoveredChannel[] = [];

  // 50件ずつチャンネル詳細を取得
  for (let i = 0; i < channelIdList.length; i += 50) {
    const batch = channelIdList.slice(i, i + 50).join(',');
    const channelsUrl = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${batch}`;
    const channelsData = await fetchWithErrorHandling(channelsUrl);
    if (!channelsData.items) continue;

    channelsData.items.forEach(
      (ch: {
        id: string;
        snippet: {
          title: string;
          description: string;
          publishedAt: string;
          thumbnails: { medium?: { url: string }; default?: { url: string } };
        };
        statistics: {
          subscriberCount: string;
          viewCount: string;
          videoCount: string;
          hiddenSubscriberCount?: boolean;
        };
      }) => {
        const subscriberCount = parseInt(ch.statistics.subscriberCount) || 0;
        const totalViewCount = parseInt(ch.statistics.viewCount) || 0;
        const videoCount = parseInt(ch.statistics.videoCount) || 0;
        const channelAgeDays = Math.max(1, (now - new Date(ch.snippet.publishedAt).getTime()) / 86400000);

        allChannels.push({
          channelId: ch.id,
          channelTitle: ch.snippet.title,
          description: (ch.snippet.description || '').substring(0, 200),
          thumbnailUrl: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url || '',
          subscriberCount,
          totalViewCount,
          videoCount,
          publishedAt: ch.snippet.publishedAt,
          isSubscriberHidden: ch.statistics.hiddenSubscriberCount || false,
          avgViewsPerVideo: videoCount > 0 ? Math.round(totalViewCount / videoCount) : 0,
          recentAvgViews: 0,
          recentMaxViews: 0,
          recentEfficiency: 0,
          buzzRatio: 0,
          growthRate: Math.round((subscriberCount / channelAgeDays) * 10) / 10,
          channelAgeDays: Math.round(channelAgeDays),
          topVideo: null,
          topVideoLong: null,
          topVideoShort: null,
        });
      }
    );
  }

  return allChannels;
}

export async function searchChannelsByKeyword(
  query: string,
  language: 'ja' | 'en' | 'all' = 'ja',
  maxResults: number = 30,
  options?: { publishedAfter?: string }
): Promise<DiscoveredChannel[]> {
  const regionCode = language === 'ja' ? 'JP' : language === 'en' ? 'US' : undefined;
  const langParam = language !== 'all' ? `&relevanceLanguage=${language}` : '';
  const regionParam = regionCode ? `&regionCode=${regionCode}` : '';

  const allChannelIds = new Set<string>();

  // ページネーションヘルパー（最大maxPages分取得）
  type SearchResult = { items?: { snippet: { channelId: string } }[]; nextPageToken?: string };
  async function fetchPages(baseUrl: string, maxPages: number) {
    let pageToken: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const url = pageToken ? `${baseUrl}&pageToken=${pageToken}` : baseUrl;
      const data = await fetchWithErrorHandling(url) as SearchResult;
      for (const item of (data.items || [])) { allChannelIds.add(item.snippet.channelId); }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  }

  // 1. チャンネル名検索（type=channel）- 1ページ
  const chUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=channel&maxResults=50${langParam}${regionParam}`;
  await fetchPages(chUrl, 1);

  // 2. 動画検索（type=video）→ チャンネル逆引き
  //    order=date を重点的に3ページ取得（小さいチャンネルは新着順の深いページにいる）
  const videoBaseUrl = `${YOUTUBE_API_BASE}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=50${langParam}${regionParam}`;

  // date順: 3ページ = 150動画（小さいチャンネルを重点的に拾う）
  // relevance順: 1ページ = 50動画（人気チャンネルをカバー）
  // 合計API消費: channel 1 + date 3 + relevance 1 = 5リクエスト = 500ユニット
  await Promise.all([
    fetchPages(`${videoBaseUrl}&order=date`, 3),
    fetchPages(`${videoBaseUrl}&order=relevance`, 1),
  ]);

  // 3. チャンネル詳細を一括取得（全チャンネル分 - フィルターはクライアント側で行う）
  const ids = [...allChannelIds];
  const channels = await buildDiscoveredChannels(ids);

  // 4. 言語フィルタリング
  const filtered = language === 'all' ? channels : channels.filter((ch) => {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uFF00-\uFFEF]/.test(ch.channelTitle + ch.description);
    return language === 'ja' ? hasJapanese : !hasJapanese;
  });

  return filtered;
}

/** 各チャンネルの直近動画データを取得して穴場スコアを算出 + ロング/ショート別に最も伸びてる動画をピックアップ */
export async function enrichChannelWithRecentStats(channel: DiscoveredChannel): Promise<DiscoveredChannel> {
  try {
    // uploads プレイリストから直近動画IDを取得（playlistItems=1u, 旧 search=100u の置換）
    const videoIdList = await fetchUploadVideoIds(channel.channelId, 10);
    if (videoIdList.length === 0) return channel;

    const videoIds = videoIdList.join(',');
    const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds}`;
    const videosData = await fetchWithErrorHandling(videosUrl);

    if (!videosData.items || videosData.items.length === 0) return channel;

    const videoDetails = videosData.items.map(
      (v: {
        id: string;
        snippet: { title: string; thumbnails: { medium?: { url: string } } };
        statistics: { viewCount: string };
        contentDetails: { duration: string };
      }) => ({
        videoId: v.id,
        title: v.snippet.title,
        viewCount: parseInt(v.statistics.viewCount) || 0,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url || '',
        duration: parseDuration(v.contentDetails.duration),
      })
    );

    const views = videoDetails.map((v: { viewCount: number }) => v.viewCount);
    const avgViews = views.reduce((s: number, v: number) => s + v, 0) / views.length;
    const maxViews = Math.max(...views);

    // ロング/ショートに分離
    type VideoDetail = { videoId: string; title: string; viewCount: number; thumbnailUrl: string; duration: number };
    const longVideos = videoDetails.filter((v: VideoDetail) => v.duration > SHORT_VIDEO_THRESHOLD);
    const shortVideos = videoDetails.filter((v: VideoDetail) => v.duration <= SHORT_VIDEO_THRESHOLD);

    // 最も再生されている動画をピックアップするヘルパー
    const pickTop = (list: VideoDetail[]): ChannelTopVideo | null => {
      if (list.length === 0) return null;
      const best = list.reduce((top: VideoDetail | null, v: VideoDetail) =>
        !top || v.viewCount > top.viewCount ? v : top, null
      );
      if (!best) return null;
      const efficiency = channel.subscriberCount > 0
        ? (best.viewCount / channel.subscriberCount) * 100 : 0;
      return {
        videoId: best.videoId,
        title: best.title,
        viewCount: best.viewCount,
        thumbnailUrl: best.thumbnailUrl,
        duration: best.duration,
        efficiency,
      };
    };

    const topVideo = pickTop(videoDetails);
    const topVideoLong = pickTop(longVideos);
    const topVideoShort = pickTop(shortVideos);

    return {
      ...channel,
      recentAvgViews: Math.round(avgViews),
      recentMaxViews: maxViews,
      recentEfficiency: channel.subscriberCount > 0 ? Math.round((avgViews / channel.subscriberCount) * 1000) / 10 : 0,
      buzzRatio: avgViews > 0 ? Math.round((maxViews / avgViews) * 10) / 10 : 0,
      topVideo,
      topVideoLong,
      topVideoShort,
    };
  } catch {
    return channel;
  }
}

export function sortDiscoveredChannels(
  channels: DiscoveredChannel[],
  sortKey: ChannelSortKey
): DiscoveredChannel[] {
  const sorted = [...channels];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'subscriberCount_asc': return a.subscriberCount - b.subscriberCount;
      case 'subscriberCount_desc': return b.subscriberCount - a.subscriberCount;
      case 'totalViewCount_desc': return b.totalViewCount - a.totalViewCount;
      case 'recentAvgViews_desc': return b.recentAvgViews - a.recentAvgViews;
      case 'buzzRatio_desc': return b.buzzRatio - a.buzzRatio;
      case 'channelAge_asc': return a.channelAgeDays - b.channelAgeDays;
      case 'channelAge_desc': return b.channelAgeDays - a.channelAgeDays;
      default: return 0;
    }
  });
  return sorted;
}

// ============================================================
// 新チャンネル発掘（開設初期の急成長動画）
// ============================================================

export async function searchNewChannelVideos(
  query: string,
  dateRange: TrendSearchRange = '1month',
  language: 'ja' | 'en' | 'all' = 'ja',
  maxSubscribers: number = 50000,
  maxChannelAgeMonths: number = 12,
  maxResults: number = 50
): Promise<TrendingVideo[]> {
  // まず通常のキーワード検索で動画を取得
  const allVideos = await searchTrendingVideos(query, dateRange, language, maxResults);

  if (allVideos.length === 0) return [];

  // チャンネルIDのユニークリストを作成
  const uniqueChannelIds = [...new Set(allVideos.map((v) => v.channelId))];

  // チャンネル情報を取得（50件ずつ）
  const channelInfoMap = new Map<string, { subscriberCount: number; publishedAt: string }>();

  for (let i = 0; i < uniqueChannelIds.length; i += 50) {
    const batch = uniqueChannelIds.slice(i, i + 50);
    const channelIds = batch.join(',');
    const url = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelIds}`;
    const data = await fetchWithErrorHandling(url);

    if (data.items) {
      data.items.forEach((ch: {
        id: string;
        snippet: { publishedAt: string };
        statistics: { subscriberCount: string };
      }) => {
        channelInfoMap.set(ch.id, {
          subscriberCount: parseInt(ch.statistics.subscriberCount) || 0,
          publishedAt: ch.snippet.publishedAt,
        });
      });
    }
  }

  const now = Date.now();
  const maxAgeMs = maxChannelAgeMonths * 30 * 86400000;

  // フィルタリング: 登録者数上限 + チャンネル開設時期
  const filtered = allVideos.filter((v) => {
    const chInfo = channelInfoMap.get(v.channelId);
    if (!chInfo) return false;

    // 登録者数フィルター
    if (chInfo.subscriberCount > maxSubscribers) return false;

    // チャンネル開設時期フィルター
    const channelAgeMs = now - new Date(chInfo.publishedAt).getTime();
    if (channelAgeMs > maxAgeMs) return false;

    return true;
  });

  // subscriberCount を追加
  return filtered.map((v) => ({
    ...v,
    subscriberCount: channelInfoMap.get(v.channelId)?.subscriberCount ?? 0,
  }));
}
