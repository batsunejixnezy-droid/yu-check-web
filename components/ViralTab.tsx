'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ChannelResult, VideoWithMetrics } from '@/types';
import { formatNumber } from '@/lib/youtube';

interface ViralTabProps {
  results: ChannelResult[];
}

interface ViralVideo extends VideoWithMetrics {
  viralRatio: number;
}

type SortMode = 'ratio' | 'views';

function analyzeTitlePatterns(videos: ViralVideo[]) {
  const total = videos.length;
  if (total === 0) return [];

  const checks = [
    { label: '【】括弧あり', test: (t: string) => /【|】/.test(t) },
    { label: '数字含む', test: (t: string) => /[0-9０-９]/.test(t) },
    { label: '疑問形(？)', test: (t: string) => /[?？]/.test(t) },
    { label: '感嘆符(!)', test: (t: string) => /[!！]/.test(t) },
    { label: '省略(…)', test: (t: string) => /…|\.\.\.|。。。/.test(t) },
    { label: '20〜50文字', test: (t: string) => t.length >= 20 && t.length <= 50 },
  ];

  return checks.map(({ label, test }) => {
    const count = videos.filter((v) => test(v.title)).length;
    const pct = Math.round((count / total) * 100);
    return { label, count, pct };
  }).sort((a, b) => b.pct - a.pct);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function ViralTab({ results }: ViralTabProps) {
  const [sortMode, setSortMode] = useState<SortMode>('ratio');

  // 全チャンネルの急上昇動画を収集
  const viralVideos: ViralVideo[] = [];

  results.forEach((result) => {
    if (result.error) return;

    const allVideos = [...result.longVideos, ...result.shortVideos];
    const channelAvg =
      allVideos.length > 0
        ? allVideos.reduce((sum, v) => sum + v.viewCount, 0) / allVideos.length
        : 0;

    allVideos.forEach((video) => {
      if (video.isViral) {
        viralVideos.push({
          ...video,
          viralRatio: channelAvg > 0 ? video.viewCount / channelAvg : 0,
        });
      }
    });
  });

  const sorted = [...viralVideos].sort((a, b) =>
    sortMode === 'ratio' ? b.viralRatio - a.viralRatio : b.viewCount - a.viewCount
  );

  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">先に「分析を実行」してください</p>
      </div>
    );
  }

  if (viralVideos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">急上昇動画が見つかりませんでした</p>
        <p className="text-xs mt-1">チャンネル内平均の2.5倍以上の再生数が条件です</p>
      </div>
    );
  }

  // チャンネル別集計
  const channelStats: Record<string, { name: string; count: number; maxRatio: number }> = {};
  viralVideos.forEach((v) => {
    if (!channelStats[v.channelId]) {
      channelStats[v.channelId] = { name: v.channelName, count: 0, maxRatio: 0 };
    }
    channelStats[v.channelId].count++;
    if (v.viralRatio > channelStats[v.channelId].maxRatio) {
      channelStats[v.channelId].maxRatio = v.viralRatio;
    }
  });
  const channelList = Object.values(channelStats).sort((a, b) => b.count - a.count);

  const titlePatterns = analyzeTitlePatterns(sorted);

  return (
    <div className="space-y-5">
      {/* サマリー */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* チャンネル別件数 */}
        <div className="bg-red-50 border border-red-100 rounded-lg p-4">
          <p className="text-xs font-medium text-red-700 mb-2">チャンネル別 急上昇数</p>
          <div className="space-y-1">
            {channelList.map((ch) => (
              <div key={ch.name} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 truncate max-w-[120px]">{ch.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="font-semibold text-red-600">{ch.count}本</span>
                  <span className="text-gray-400">最大{ch.maxRatio.toFixed(1)}倍</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* タイトルパターン */}
        <div className="sm:col-span-2 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-700 mb-2">急上昇動画のタイトルパターン（上位{sorted.length}本）</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {titlePatterns.map(({ label, count, pct }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full bg-orange-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 whitespace-nowrap w-20">{label}</span>
                <span className="text-xs font-semibold text-gray-800 w-10 text-right">{pct}%</span>
                <span className="text-xs text-gray-400">({count}本)</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">急上昇動画に共通するタイトルの特徴</p>
        </div>
      </div>

      {/* ヘッダー + ソート */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-sm font-medium text-gray-700">
          急上昇動画一覧
          <span className="ml-2 text-xs text-gray-400">（チャンネル平均の2.5倍以上 / {sorted.length}件）</span>
        </h2>
        <div className="flex gap-1">
          {([
            { key: 'ratio', label: 'バイラル倍率順' },
            { key: 'views', label: '再生数順' },
          ] as { key: SortMode; label: string }[]).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortMode(s.key)}
              className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                sortMode === s.key
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="text-left py-3 pl-4 pr-2 font-medium w-8">#</th>
              <th className="text-left py-3 px-3 font-medium min-w-[280px]">動画</th>
              <th className="text-right py-3 px-3 font-medium">再生数</th>
              <th className="text-right py-3 px-3 font-medium">平均比</th>
              <th className="text-right py-3 px-3 font-medium">投稿日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {sorted.map((video, idx) => (
              <tr key={`${video.channelId}-${video.videoId}`} className="hover:bg-red-50 transition-colors">
                <td className="py-3 pl-4 pr-2">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                    idx === 0 ? 'bg-red-100 text-red-700' :
                    idx <= 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {idx + 1}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-start gap-3">
                    {video.thumbnailUrl && (
                      <a
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <Image
                          src={video.thumbnailUrl}
                          alt={video.title}
                          width={80}
                          height={45}
                          className="rounded object-cover hover:opacity-80 transition-opacity"
                          unoptimized
                        />
                      </a>
                    )}
                    <div className="min-w-0">
                      <a
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-gray-900 hover:text-red-600 line-clamp-2 leading-snug"
                      >
                        {video.title}
                      </a>
                      <p className="text-xs text-gray-400 mt-0.5">{video.channelName}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 text-right font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                  {formatNumber(video.viewCount)}
                </td>
                <td className="py-3 px-3 text-right whitespace-nowrap">
                  <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-bold">
                    {video.viralRatio.toFixed(1)}倍
                  </span>
                </td>
                <td className="py-3 px-3 text-right text-xs text-gray-500 whitespace-nowrap">
                  {formatDate(video.publishedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
