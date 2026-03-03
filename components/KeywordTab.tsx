'use client';

import { useState } from 'react';
import { ChannelResult } from '@/types';
import { extractKeywords } from '@/lib/analysis';

interface KeywordTabProps {
  results: ChannelResult[];
}

export default function KeywordTab({ results }: KeywordTabProps) {
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

  const keywords = extractKeywords(selectedVideos, 20);
  const maxCount = keywords.length > 0 ? keywords[0].count : 1;

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
          上位50%の動画タイトルから抽出
        </span>
      </div>

      {keywords.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">キーワードを抽出できませんでした</p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-4">
            頻出キーワード TOP{keywords.length}
          </h3>
          <div className="space-y-2">
            {keywords.map((item, index) => {
              const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
              const isTop3 = index < 3;

              return (
                <div key={item.word} className="flex items-center gap-3">
                  {/* 順位 */}
                  <span
                    className={`text-sm font-bold w-6 text-right flex-shrink-0 ${
                      index === 0
                        ? 'text-yellow-500'
                        : index === 1
                        ? 'text-gray-400'
                        : index === 2
                        ? 'text-amber-600'
                        : 'text-gray-300'
                    }`}
                  >
                    {index + 1}
                  </span>

                  {/* キーワード */}
                  <span
                    className={`text-sm w-32 flex-shrink-0 ${
                      isTop3 ? 'font-semibold text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {item.word}
                  </span>

                  {/* バー */}
                  <div className="flex-1 bg-gray-100 rounded h-6 relative overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        isTop3 ? 'bg-red-500' : 'bg-red-200'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>

                  {/* カウント */}
                  <span className="text-sm text-gray-600 w-12 text-right flex-shrink-0">
                    {item.count}回
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            ※上位50%の動画タイトルのみを対象に集計しています
          </p>
        </div>
      )}
    </div>
  );
}
