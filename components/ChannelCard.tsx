'use client';

import { useState } from 'react';
import { ChannelResult, DateRange } from '@/types';
import { formatNumber } from '@/lib/youtube';
import VideoTable from './VideoTable';

const DATE_RANGE_LABELS: Record<string, string> = {
  '1month': '直近1ヶ月',
  '3months': '直近3ヶ月',
  '6months': '直近6ヶ月',
  '1year': '直近1年',
  'all': '全期間',
};

interface ChannelCardProps {
  result: ChannelResult;
  displayLimit?: number;
  dateRange?: DateRange;
  onAnalyzeVideo?: (videoId: string) => void;
}

export default function ChannelCard({ result, displayLimit, dateRange, onAnalyzeVideo }: ChannelCardProps) {
  const [activeTab, setActiveTab] = useState<'long' | 'short'>('long');

  if (result.error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-gray-900">{result.channelId}</p>
            <p className="text-sm text-red-600 mt-1">{result.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const allVideos = [...result.longVideos, ...result.shortVideos];
  const viralCount = allVideos.filter((v) => v.isViral).length;

  // いいね率の計算（全動画の平均）
  const videosWithViews = allVideos.filter((v) => v.viewCount > 0);
  const avgLikeRate =
    videosWithViews.length > 0
      ? videosWithViews.reduce((sum, v) => sum + v.likeCount / v.viewCount, 0) /
        videosWithViews.length
      : 0;

  const score = result.scoreBreakdown?.total ?? null;

  // スコアに応じた色
  const scoreColor =
    score === null
      ? 'text-gray-400'
      : score >= 70
      ? 'text-green-600'
      : score >= 40
      ? 'text-yellow-600'
      : 'text-red-500';

  const scoreBgColor =
    score === null
      ? 'bg-gray-100'
      : score >= 70
      ? 'bg-green-50 border-green-200'
      : score >= 40
      ? 'bg-yellow-50 border-yellow-200'
      : 'bg-red-50 border-red-200';

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* チャンネルヘッダー */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* スコアバッジ */}
          {score !== null && (
            <div
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg border ${scoreBgColor} flex-shrink-0`}
            >
              <span className={`text-lg font-bold leading-none ${scoreColor}`}>
                {score}
              </span>
              <span className="text-xs text-gray-400 leading-none mt-0.5">点</span>
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900">{result.channelName}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              登録者 {formatNumber(result.subscriberCount)}人
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-1 text-xs flex-wrap justify-end">
            {dateRange && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded font-medium">
                {DATE_RANGE_LABELS[dateRange] ?? dateRange}
              </span>
            )}
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">
              ロング {result.longVideos.length}本
            </span>
            <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded">
              ショート {result.shortVideos.length}本
            </span>
          </div>
          <div className="flex gap-1 text-xs">
            {viralCount > 0 && (
              <span className="px-2 py-1 bg-red-50 text-red-600 rounded font-medium">
                急上昇 {viralCount}本
              </span>
            )}
            {avgLikeRate > 0 && (
              <span className="px-2 py-1 bg-gray-50 text-gray-600 rounded">
                いいね率 {(avgLikeRate * 100).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setActiveTab('long')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'long'
              ? 'text-red-600 border-b-2 border-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ロング動画
        </button>
        <button
          onClick={() => setActiveTab('short')}
          className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'short'
              ? 'text-red-600 border-b-2 border-red-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          ショート動画
        </button>
      </div>

      {/* テーブル */}
      <div className="px-5 py-4">
        {activeTab === 'long' && (
          <VideoTable videos={result.longVideos} videoType="long" limit={displayLimit} onAnalyzeVideo={onAnalyzeVideo} />
        )}
        {activeTab === 'short' && (
          <VideoTable videos={result.shortVideos} videoType="short" limit={displayLimit} onAnalyzeVideo={onAnalyzeVideo} />
        )}
      </div>
    </div>
  );
}
