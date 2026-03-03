'use client';

import { useState } from 'react';
import { ChannelResult } from '@/types';
import { analyzePostingTimes } from '@/lib/analysis';
import { formatNumber } from '@/lib/youtube';

interface PostingTimeTabProps {
  results: ChannelResult[];
}

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function PostingTimeTab({ results }: PostingTimeTabProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>('all');

  const validResults = results.filter((r) => !r.error);

  if (validResults.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">先に「分析を実行」してください</p>
      </div>
    );
  }

  // 選択されたチャンネルの動画データを集める
  const selectedVideos = (() => {
    if (selectedChannel === 'all') {
      return validResults.flatMap((r) => [...r.longVideos, ...r.shortVideos]);
    }
    const result = validResults.find((r) => r.channelId === selectedChannel);
    if (!result) return [];
    return [...result.longVideos, ...result.shortVideos];
  })();

  // postingAnalysisを計算（選択されたチャンネルに応じて）
  const postingAnalysis = (() => {
    if (selectedChannel !== 'all') {
      const result = validResults.find((r) => r.channelId === selectedChannel);
      if (result?.postingAnalysis) return result.postingAnalysis;
    }
    // 全体またはpostingAnalysisがない場合は再計算
    return analyzePostingTimes(selectedVideos);
  })();

  const { byHour, byDay, bestHour, bestDay } = postingAnalysis;

  // ヒートマップの最大値
  const maxHourViews = Math.max(...byHour, 1);
  const maxDayViews = Math.max(...byDay, 1);

  // 時間帯の投稿数を集計
  const hourPostCount = new Array(24).fill(0);
  const dayPostCount = new Array(7).fill(0);
  selectedVideos.forEach((v) => {
    hourPostCount[v.publishHour]++;
    dayPostCount[v.publishDayOfWeek]++;
  });

  // 信頼度：3本以上あれば参考になる
  const MIN_RELIABLE = 3;
  const bestHourCount = hourPostCount[bestHour];
  const bestDayCount = dayPostCount[bestDay];
  const isReliable = bestHourCount >= MIN_RELIABLE && bestDayCount >= MIN_RELIABLE && selectedVideos.length >= 10;

  return (
    <div className="space-y-6">
      {/* チャンネルセレクター */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 whitespace-nowrap">対象:</label>
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500"
        >
          <option value="all">全チャンネル合計</option>
          {validResults.map((r) => (
            <option key={r.channelId} value={r.channelId}>
              {r.channelName}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">
          {selectedVideos.length}本の動画を分析
        </span>
      </div>

      {/* 推奨投稿時間 */}
      <div className={`border rounded-lg p-4 ${isReliable ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={`text-sm font-medium ${isReliable ? 'text-red-800' : 'text-gray-600'}`}>
              ライバルの主要投稿時間帯
            </p>
            <p className={`text-lg font-bold mt-1 ${isReliable ? 'text-red-600' : 'text-gray-500'}`}>
              {DAY_NAMES[bestDay]}曜日の{bestHour}時ごろ
            </p>
            <p className="text-xs text-gray-500 mt-1">
              この時間帯の投稿: {hourPostCount[bestHour]}本 / 平均再生数: {formatNumber(byHour[bestHour])}回
            </p>
          </div>
          <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
            isReliable
              ? 'bg-green-100 text-green-700'
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {isReliable ? '信頼度: 高' : `信頼度: 低 (データ${selectedVideos.length}本)`}
          </div>
        </div>
        {!isReliable && (
          <p className="text-xs text-gray-500 mt-2 border-t border-gray-200 pt-2">
            サンプル数が少ないため参考程度に。より正確な分析には各時間帯3本以上・合計10本以上のデータが必要です。
          </p>
        )}
      </div>

      {/* 時間帯別ヒートマップ */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          時間帯別 平均再生数（JST）
        </h3>
        <div className="space-y-1">
          {Array.from({ length: 24 }, (_, hour) => {
            const views = byHour[hour];
            const count = hourPostCount[hour];
            const barWidth = maxHourViews > 0 ? (views / maxHourViews) * 100 : 0;
            const isBest = hour === bestHour;
            const isLowData = count > 0 && count < MIN_RELIABLE;

            return (
              <div key={hour} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0">
                  {String(hour).padStart(2, '0')}時
                </span>
                <div className="flex-1 bg-gray-100 rounded h-5 relative overflow-hidden">
                  <div
                    className={`h-full rounded transition-all ${
                      isBest ? 'bg-red-500' : isLowData ? 'bg-gray-300' : 'bg-blue-200'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">
                  {views > 0 ? formatNumber(views) : '-'}
                </span>
                <span className={`text-xs w-12 text-right flex-shrink-0 ${
                  count === 0 ? 'text-gray-200' : isLowData ? 'text-yellow-500' : 'text-gray-400'
                }`}>
                  {count > 0 ? `${count}本` : ''}
                  {isLowData && ' ⚠'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">
          赤いバー = 最も再生される時間帯 / ⚠ = サンプル数が少なく参考程度
        </p>
      </div>

      {/* 曜日別棒グラフ */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          曜日別 平均再生数
        </h3>
        <div className="flex items-end gap-2 h-32">
          {byDay.map((views, day) => {
            const barHeight = maxDayViews > 0 ? (views / maxDayViews) * 100 : 0;
            const isBest = day === bestDay;
            const count = dayPostCount[day];
            const isLowData = count > 0 && count < MIN_RELIABLE;

            return (
              <div key={day} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">
                  {views > 0 ? formatNumber(views) : '-'}
                </span>
                <div className="w-full flex items-end" style={{ height: '80px' }}>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isBest ? 'bg-red-500' : isLowData ? 'bg-gray-300' : 'bg-blue-200'
                    }`}
                    style={{ height: `${barHeight}%` }}
                  />
                </div>
                <span
                  className={`text-xs font-medium ${
                    isBest ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {DAY_NAMES[day]}
                </span>
                <span className={`text-xs ${isLowData ? 'text-yellow-500' : 'text-gray-300'}`}>
                  {count > 0 ? `${count}本` : ''}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-2">赤いバー = 最も再生される曜日 / グレー = サンプル数が少ない曜日</p>
      </div>
    </div>
  );
}
