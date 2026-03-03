'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChannelResult, VideoWithMetrics } from '@/types';
import { formatNumber, formatDuration } from '@/lib/youtube';

interface VideoAnalysisTabProps {
  results: ChannelResult[];
}

type SortKey = 'rank' | 'publishedAt' | 'diffFromAverage' | 'likeRate' | 'commentRate' | 'duration';
type SortDir = 'asc' | 'desc';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  const dow = DAY_LABELS[jst.getUTCDay()];
  return `${y}/${m}/${day} (${dow})`;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-gray-300 ml-0.5 text-xs">↕</span>;
  return <span className="text-red-500 ml-0.5 text-xs">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function StatsBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-2 bg-gray-50 rounded-lg">
      <span className={`text-base font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-400 mt-0.5">{label}</span>
    </div>
  );
}

export default function VideoAnalysisTab({ results }: VideoAnalysisTabProps) {
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);
  const [videoType, setVideoType] = useState<'long' | 'short'>('long');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const validResults = results.filter((r) => !r.error && (r.longVideos.length > 0 || r.shortVideos.length > 0));

  if (results.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.867v6.266a1 1 0 01-1.447.902L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <p className="text-sm font-medium">先に「分析を実行」してください</p>
      </div>
    );
  }

  if (validResults.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center">分析結果がありません</p>;
  }

  const safeIndex = Math.min(selectedChannelIndex, validResults.length - 1);
  const currentResult = validResults[safeIndex];
  const videos: VideoWithMetrics[] = videoType === 'long' ? currentResult.longVideos : currentResult.shortVideos;

  const maxViews = videos.length > 0 ? Math.max(...videos.map((v) => v.viewCount)) : 1;
  const avgViews = videos.length > 0 ? videos.reduce((s, v) => s + v.viewCount, 0) / videos.length : 0;
  const minViews = videos.length > 0 ? Math.min(...videos.map((v) => v.viewCount)) : 0;
  const viralCount = videos.filter((v) => v.isViral).length;
  const avgLikeRate =
    videos.filter((v) => v.viewCount > 0).length > 0
      ? videos.filter((v) => v.viewCount > 0).reduce((s, v) => s + v.likeCount / v.viewCount, 0) /
        videos.filter((v) => v.viewCount > 0).length
      : 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // デフォルト方向: rankとpublishedAtはasc(古い順→新しい順は後で)、残りはdesc
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const sortedVideos = [...videos].sort((a, b) => {
    let aVal = 0, bVal = 0;
    switch (sortKey) {
      case 'rank':
        aVal = a.rank; bVal = b.rank; break;
      case 'publishedAt':
        aVal = new Date(a.publishedAt).getTime(); bVal = new Date(b.publishedAt).getTime(); break;
      case 'diffFromAverage':
        aVal = a.diffFromAverage; bVal = b.diffFromAverage; break;
      case 'likeRate':
        aVal = a.viewCount > 0 ? a.likeCount / a.viewCount : 0;
        bVal = b.viewCount > 0 ? b.likeCount / b.viewCount : 0; break;
      case 'commentRate':
        aVal = a.viewCount > 0 ? a.commentCount / a.viewCount : 0;
        bVal = b.viewCount > 0 ? b.commentCount / b.viewCount : 0; break;
      case 'duration':
        aVal = a.duration; bVal = b.duration; break;
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const SortTh = ({
    col,
    label,
    align = 'right',
    className = '',
  }: {
    col: SortKey;
    label: string;
    align?: 'left' | 'right';
    className?: string;
  }) => (
    <th className={`py-2.5 px-3 font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        onClick={() => handleSort(col)}
        className="hover:text-gray-800 transition-colors inline-flex items-center gap-0.5"
      >
        {label}
        <SortIcon active={sortKey === col} dir={sortDir} />
      </button>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* チャンネルタブ */}
      <div className="overflow-x-auto -mx-1">
        <div className="flex gap-0.5 min-w-max border-b border-gray-200 px-1">
          {validResults.map((result, index) => (
            <button
              key={result.channelId}
              onClick={() => setSelectedChannelIndex(index)}
              className={`px-4 py-2.5 text-sm rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                safeIndex === index
                  ? 'border-red-600 text-red-600 font-semibold bg-red-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {result.channelName}
            </button>
          ))}
        </div>
      </div>

      {/* コントロール行 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* ロング / ショート切り替え */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setVideoType('long')}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              videoType === 'long'
                ? 'bg-white text-blue-700 font-semibold shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ロング動画 {currentResult.longVideos.length}本
          </button>
          <button
            onClick={() => setVideoType('short')}
            className={`px-3 py-1.5 text-sm rounded-md transition-all ${
              videoType === 'short'
                ? 'bg-white text-purple-700 font-semibold shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ショート動画 {currentResult.shortVideos.length}本
          </button>
        </div>

        {/* 統計サマリー */}
        {videos.length > 0 && (
          <div className="flex gap-2">
            <StatsBadge label="平均再生数" value={formatNumber(Math.round(avgViews))} color="text-gray-900" />
            <StatsBadge label="最高" value={formatNumber(maxViews)} color="text-green-600" />
            <StatsBadge label="最低" value={formatNumber(minViews)} color="text-red-500" />
            {viralCount > 0 && (
              <StatsBadge label="急上昇" value={`${viralCount}本`} color="text-orange-500" />
            )}
            <StatsBadge label="平均いいね率" value={`${(avgLikeRate * 100).toFixed(2)}%`} color="text-blue-600" />
          </div>
        )}
      </div>

      {/* テーブル */}
      {videos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">該当する動画がありません</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <SortTh col="rank" label="#" align="left" className="pl-4 w-10" />
                <th className="text-left py-2.5 px-3 font-medium min-w-[300px]">動画</th>
                <th className="text-right py-2.5 px-3 font-medium">再生数</th>
                <th className="text-left py-2.5 px-3 font-medium min-w-[130px]">パフォーマンス</th>
                <SortTh col="diffFromAverage" label="平均比" />
                <SortTh col="likeRate" label="いいね率" />
                <SortTh col="commentRate" label="コメ率" />
                <SortTh col="publishedAt" label="投稿日" />
                <SortTh col="duration" label="長さ" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sortedVideos.map((video) => {
                const barPct = maxViews > 0 ? (video.viewCount / maxViews) * 100 : 0;
                const likeRate = video.viewCount > 0 ? (video.likeCount / video.viewCount) * 100 : 0;
                const commentRate = video.viewCount > 0 ? (video.commentCount / video.viewCount) * 100 : 0;
                const viewDiff = video.viewCount - video.averageViews;
                const isPositive = viewDiff >= 0;
                const diffColor =
                  video.diffFromAverage > 20
                    ? 'text-green-600'
                    : video.diffFromAverage < -20
                    ? 'text-red-500'
                    : 'text-gray-500';
                const barColor =
                  barPct >= 75
                    ? 'bg-green-500'
                    : barPct >= 45
                    ? 'bg-blue-400'
                    : barPct >= 20
                    ? 'bg-yellow-400'
                    : 'bg-gray-300';
                const rankBg =
                  video.rank <= 3
                    ? 'bg-green-100 text-green-800'
                    : video.rank >= videos.length - 1
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600';

                return (
                  <tr key={video.videoId} className="hover:bg-gray-50 transition-colors">
                    {/* # */}
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${rankBg}`}
                        >
                          {video.rank}
                        </span>
                        {video.isViral && (
                          <span className="text-sm" title="急上昇">🔥</span>
                        )}
                      </div>
                    </td>

                    {/* 動画 */}
                    <td className="py-3 px-3">
                      <div className="flex items-start gap-3">
                        <a
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0"
                        >
                          <Image
                            src={video.thumbnailUrl}
                            alt={video.title}
                            width={96}
                            height={54}
                            className="rounded-md object-cover hover:opacity-80 transition-opacity"
                            unoptimized
                          />
                        </a>
                        <div className="min-w-0 flex-1">
                          <a
                            href={`https://www.youtube.com/watch?v=${video.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-gray-900 hover:text-red-600 transition-colors line-clamp-2 leading-snug"
                          >
                            {video.title}
                          </a>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-xs text-gray-400">
                              👍 {formatNumber(video.likeCount)}
                            </span>
                            <span className="text-xs text-gray-400">
                              💬 {formatNumber(video.commentCount)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 再生数 */}
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatNumber(video.viewCount)}
                      <span className="block text-xs font-normal text-gray-400">
                        {video.viewCount.toLocaleString('ja-JP')}
                      </span>
                    </td>

                    {/* パフォーマンスバー */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 min-w-[80px]">
                          <div
                            className={`h-2.5 rounded-full transition-all ${barColor}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-9 text-right tabular-nums">
                          {Math.round(barPct)}%
                        </span>
                      </div>
                    </td>

                    {/* 平均比 */}
                    <td className="py-3 px-3 text-right">
                      <span className={`text-sm font-semibold ${diffColor} tabular-nums`}>
                        {isPositive ? '+' : ''}
                        {formatNumber(Math.abs(viewDiff))}
                      </span>
                      <span className={`block text-xs tabular-nums ${diffColor}`}>
                        ({isPositive ? '+' : ''}{video.diffFromAverage.toFixed(0)}%)
                      </span>
                    </td>

                    {/* いいね率 */}
                    <td className="py-3 px-3 text-right text-gray-700 tabular-nums text-sm">
                      {likeRate.toFixed(2)}%
                    </td>

                    {/* コメ率 */}
                    <td className="py-3 px-3 text-right text-gray-500 tabular-nums text-sm">
                      {commentRate.toFixed(3)}%
                    </td>

                    {/* 投稿日 */}
                    <td className="py-3 px-3 text-right text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(video.publishedAt)}
                    </td>

                    {/* 長さ */}
                    <td className="py-3 px-3 text-right text-gray-500 tabular-nums text-sm whitespace-nowrap">
                      {formatDuration(video.duration)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
