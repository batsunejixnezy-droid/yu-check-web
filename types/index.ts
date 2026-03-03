export interface Channel {
  id: string;
  name: string;
  channelId: string;
  note?: string;
}

export interface VideoData {
  videoId: string;
  title: string;
  publishedAt: string;
  duration: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  channelName: string;
  channelId: string;
  subscriberCount: number;
  publishHour: number;
  publishDayOfWeek: number;
  isViral: boolean;
}

export interface VideoWithMetrics extends VideoData {
  rank: number;
  engagementRate: number;
  videoType: 'long' | 'short';
  averageViews: number;
  minViews: number;
  maxViews: number;
  diffFromAverage: number;
}

export interface ScoreBreakdown {
  engagement: number;
  stability: number;
  viral: number;
  frequency: number;
  trend: number;
  total: number;
}

export interface PostingAnalysis {
  byHour: number[];
  byDay: number[];
  bestHour: number;
  bestDay: number;
}

export interface ChannelResult {
  channelId: string;
  channelName: string;
  subscriberCount: number;
  longVideos: VideoWithMetrics[];
  shortVideos: VideoWithMetrics[];
  error?: string;
  scoreBreakdown?: ScoreBreakdown;
  postingAnalysis?: PostingAnalysis;
}

export type DateRange = '1month' | '3months' | '6months' | '1year' | 'all';

export interface AppSettings {
  channels: Channel[];
  maxVideos: number;
  dateRange: DateRange;
}
