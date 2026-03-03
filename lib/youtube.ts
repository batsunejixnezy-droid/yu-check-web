import { VideoData, VideoWithMetrics, ChannelResult, DateRange } from '@/types';
import { calculateChannelScore, analyzePostingTimes } from '@/lib/analysis';

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

async function fetchWithErrorHandling(url: string) {
  // /api/youtube?endpoint=xxx&... の形式に変換
  const urlObj = new URL(url, 'http://localhost');
  const endpoint = urlObj.pathname.replace('/api/youtube/', '');
  const params = new URLSearchParams(urlObj.search);
  params.set('endpoint', endpoint);
  const apiUrl = `${YOUTUBE_API_BASE}?${params.toString()}`;

  const response = await fetch(apiUrl);
  const data = await response.json();

  if (!response.ok) {
    const errorReason = data?.error?.errors?.[0]?.reason;
    if (errorReason === 'quotaExceeded') {
      throw new Error('YouTube APIのクォータ制限に達しました。明日再試行してください。');
    } else if (errorReason === 'keyInvalid') {
      throw new Error('APIキーが無効です。正しいAPIキーを設定してください。');
    }
    throw new Error(`API呼び出しエラー: ${data?.error?.message || response.statusText}`);
  }

  return data;
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

export async function fetchRecentVideos(
  channelId: string,
  maxResults: number = 50,
  publishedAfter?: string
): Promise<VideoData[]> {
  const searchItems: { id: { videoId: string } }[] = [];
  let pageToken = '';
  let remaining = maxResults;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, 50);
    let searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&order=date&maxResults=${batchSize}&type=video`;
    if (pageToken) searchUrl += `&pageToken=${pageToken}`;
    if (publishedAfter) searchUrl += `&publishedAfter=${encodeURIComponent(publishedAfter)}`;

    const searchData = await fetchWithErrorHandling(searchUrl);

    if (!searchData.items || searchData.items.length === 0) break;

    searchItems.push(...searchData.items);
    remaining -= searchData.items.length;

    if (!searchData.nextPageToken) break;
    pageToken = searchData.nextPageToken;
  }

  if (searchItems.length === 0) return [];

  // 50件ずつ動画詳細を取得
  const allVideoDetails = [];
  for (let i = 0; i < searchItems.length; i += 50) {
    const batch = searchItems.slice(i, i + 50);
    const videoIds = batch.map((item) => item.id.videoId).join(',');
    const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds}`;
    const videosData = await fetchWithErrorHandling(videosUrl);
    allVideoDetails.push(...videosData.items);
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

export async function fetchVideoAnalysis(urlOrId: string): Promise<VideoAnalysisData> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) throw new Error('有効なYouTube URLまたは動画IDを入力してください');

  const videoUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}`;
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

  // 同チャンネルの直近30本で比較
  const recentVideos = await fetchRecentVideos(channelId, 30);
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
  maxResults: number = 100
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
    const videosUrl = `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoIds}`;
    const videosData = await fetchWithErrorHandling(videosUrl);

    videosData.items?.forEach((video: {
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

  return allVideos.sort((a, b) => b.viewsPerDay - a.viewsPerDay);
}
