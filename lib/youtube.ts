import { VideoData, VideoWithMetrics, ChannelResult } from '@/types';
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
  maxResults: number = 50
): Promise<VideoData[]> {
  // ページネーションで動画を取得
  const searchItems: { id: { videoId: string } }[] = [];
  let pageToken = '';
  let remaining = maxResults;

  while (remaining > 0) {
    const batchSize = Math.min(remaining, 50);
    let searchUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&order=date&maxResults=${batchSize}&type=video`;
    if (pageToken) {
      searchUrl += `&pageToken=${pageToken}`;
    }

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

  // まず全動画の再生数を取得して平均を計算（isViral判定用）
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

  // チャンネル内平均再生数を計算してisViralを設定
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
  maxVideos: number = 30
): Promise<ChannelResult> {
  // チャンネル情報を取得
  const channelData = await fetchChannelData(channelId);

  // 動画を取得（ロング・ショート各maxVideos本確保するため多めに取得）
  const fetchCount = Math.min(maxVideos * 6, 300);
  const videos = await fetchRecentVideos(channelData.actualChannelId, fetchCount);

  // subscriberCountを各動画に設定
  videos.forEach((v) => {
    v.subscriberCount = channelData.subscriberCount;
    v.channelName = channelData.channelTitle;
  });

  const { longVideos, shortVideos } = categorizeVideos(videos);

  const longVideosSliced = longVideos.slice(0, maxVideos);
  const shortVideosSliced = shortVideos.slice(0, maxVideos);

  // スコアと投稿時間分析（全動画を使用）
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
