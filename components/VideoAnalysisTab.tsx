'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { VideoAnalysisData, fetchVideoAnalysis, formatNumber, formatDuration } from '@/lib/youtube';

interface VideoAnalysisTabProps {
  initialVideoId?: string | null;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} (${DAY_LABELS[d.getDay()]})`;
}

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold text-gray-900">{value}</span>
        {sub && <span className="text-xs text-gray-400 ml-1.5">{sub}</span>}
      </div>
    </div>
  );
}

function TitleBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
      ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      {ok ? '✓' : '–'} {label}
    </span>
  );
}

function analyzeTitleStructure(title: string) {
  const len = title.length;
  const hasBrackets = /【|】|「|」/.test(title);
  const hasNumbers = /[0-9０-９]/.test(title);
  const hasQuestion = /[?？]/.test(title);
  const hasEllipsis = /…|\.{3}|。。。/.test(title);
  const hasExclamation = /[!！]/.test(title);
  const hasYearMonth = /[年月]|20\d\d/.test(title);

  const lenGrade =
    len <= 20 ? { label: `${len}文字 (短め)`, ok: false } :
    len <= 50 ? { label: `${len}文字 (最適)`, ok: true } :
    { label: `${len}文字 (長め)`, ok: false };

  return { len, lenGrade, hasBrackets, hasNumbers, hasQuestion, hasEllipsis, hasExclamation, hasYearMonth };
}

export default function VideoAnalysisTab({ initialVideoId }: VideoAnalysisTabProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<VideoAnalysisData | null>(null);
  const [error, setError] = useState('');

  // 分析タブから動画IDが渡されたとき自動で分析する
  useEffect(() => {
    if (initialVideoId) {
      const url = `https://www.youtube.com/watch?v=${initialVideoId}`;
      setInput(url);
      runAnalysis(url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideoId]);

  const runAnalysis = async (urlOverride?: string) => {
    const target = (urlOverride ?? input).trim();
    if (!target) return;

    setIsLoading(true);
    setError('');
    setData(null);

    try {
      const result = await fetchVideoAnalysis(target);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const diffColor = data
    ? data.diffFromAvg >= 20 ? 'text-green-600' : data.diffFromAvg <= -20 ? 'text-red-500' : 'text-gray-600'
    : '';

  const titleAnalysis = data ? analyzeTitleStructure(data.title) : null;

  return (
    <div className="space-y-5">
      {/* 入力エリア */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && !isLoading && runAnalysis()}
          placeholder="YouTubeの動画URL または 動画ID を貼り付け..."
          className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          disabled={isLoading}
        />
        <button
          onClick={() => runAnalysis()}
          disabled={isLoading || !input.trim()}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap shadow-sm"
        >
          {isLoading ? '取得中...' : '分析'}
        </button>
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{error}</div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">動画情報とチャンネル平均を取得中...</p>
          </div>
        </div>
      )}

      {/* 空状態 */}
      {!isLoading && !data && !error && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🎬</div>
          <p className="text-sm font-medium text-gray-500">URLを貼り付けて分析する</p>
          <p className="text-xs mt-2 text-gray-400">
            分析タブの動画一覧から「詳細」ボタンでも開けます
          </p>
        </div>
      )}

      {/* 分析結果 */}
      {data && !isLoading && (
        <div className="space-y-4">
          {/* 動画ヘッダー */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex gap-4 p-5">
              {/* サムネイル */}
              <div className="flex-shrink-0">
                <a
                  href={`https://www.youtube.com/watch?v=${data.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    src={data.thumbnailUrl}
                    alt={data.title}
                    width={240}
                    height={135}
                    className="rounded-lg object-cover hover:opacity-90 transition-opacity"
                    unoptimized
                  />
                </a>
              </div>

              {/* タイトルと基本情報 */}
              <div className="flex-1 min-w-0 space-y-2">
                <a
                  href={`https://www.youtube.com/watch?v=${data.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-base font-bold text-gray-900 hover:text-blue-600 transition-colors leading-snug"
                >
                  {data.title}
                </a>
                <a
                  href={`https://www.youtube.com/channel/${data.channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-blue-500 block"
                >
                  {data.channelName}
                </a>
                <p className="text-xs text-gray-400">
                  {formatDate(data.publishedAt)} {String(data.publishHour).padStart(2, '0')}:00 投稿 (JST)
                </p>

                {/* メトリクスバッジ */}
                <div className="flex gap-2 flex-wrap pt-1">
                  <span className="px-2.5 py-1 bg-gray-900 text-white text-xs font-bold rounded-full">
                    {formatNumber(data.viewCount)} 回再生
                  </span>
                  <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                    👍 {formatNumber(data.likeCount)} ({(data.likeRate * 100).toFixed(2)}%)
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                    💬 {formatNumber(data.commentCount)}
                  </span>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                    ⏱ {formatDuration(data.duration)}
                  </span>
                </div>
              </div>
            </div>

            {/* チャンネル平均比 — チャンネルデータがある場合のみ */}
            {data.channelAvgViews > 0 && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-0.5">この動画</p>
                      <p className="text-lg font-bold text-gray-900">{formatNumber(data.viewCount)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-0.5">CH平均 (直近{data.channelVideoCount}本)</p>
                      <p className="text-lg font-bold text-gray-500">{formatNumber(data.channelAvgViews)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-0.5">平均比</p>
                      <p className={`text-lg font-bold ${diffColor}`}>
                        {data.diffFromAvg >= 0 ? '+' : ''}{data.diffFromAvg.toFixed(0)}%
                      </p>
                    </div>
                    {data.channelRank > 0 && (
                      <div className="text-center">
                        <p className="text-xs text-gray-400 mb-0.5">CH内順位</p>
                        <p className="text-lg font-bold text-gray-900">
                          {data.channelRank}位 / {data.channelVideoCount}本
                        </p>
                      </div>
                    )}
                  </div>

                  {/* パフォーマンスバー */}
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 whitespace-nowrap">チャンネル内</span>
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div
                          className={`h-3 rounded-full transition-all ${
                            data.diffFromAvg >= 50 ? 'bg-green-500' :
                            data.diffFromAvg >= 0 ? 'bg-blue-400' :
                            data.diffFromAvg >= -30 ? 'bg-yellow-400' : 'bg-red-400'
                          }`}
                          style={{
                            width: `${Math.max(5, Math.min(100,
                              data.channelVideoCount > 0
                                ? ((data.channelVideoCount - data.channelRank + 1) / data.channelVideoCount) * 100
                                : 50
                            ))}%`
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">上位</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 詳細スタッツ */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">詳細指標</h3>
              <div>
                <StatRow
                  label="再生数 (正確な値)"
                  value={data.viewCount.toLocaleString('ja-JP')}
                />
                <StatRow
                  label="高評価率"
                  value={`${(data.likeRate * 100).toFixed(2)}%`}
                  sub={`${data.likeCount.toLocaleString('ja-JP')} いいね`}
                />
                <StatRow
                  label="コメント率"
                  value={`${(data.commentRate * 100).toFixed(3)}%`}
                  sub={`${data.commentCount.toLocaleString('ja-JP')} コメント`}
                />
                <StatRow
                  label="動画時間"
                  value={formatDuration(data.duration)}
                  sub={`${data.duration}秒`}
                />
                <StatRow
                  label="投稿曜日"
                  value={`${DAY_LABELS[data.publishDayOfWeek]}曜日`}
                />
                <StatRow
                  label="投稿時間 (JST)"
                  value={`${String(data.publishHour).padStart(2, '0')}:00 〜 ${String(data.publishHour + 1).padStart(2, '0')}:00`}
                />
              </div>
            </div>

            {/* タイトル分析 */}
            {titleAnalysis && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-3">タイトル分析</h3>
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-sm text-gray-700 leading-relaxed break-all">{data.title}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <TitleBadge ok={titleAnalysis.lenGrade.ok} label={titleAnalysis.lenGrade.label} />
                  <TitleBadge ok={titleAnalysis.hasBrackets} label="【】括弧あり" />
                  <TitleBadge ok={titleAnalysis.hasNumbers} label="数字あり" />
                  <TitleBadge ok={titleAnalysis.hasQuestion} label="疑問形" />
                  <TitleBadge ok={titleAnalysis.hasEllipsis} label="省略(…)" />
                  <TitleBadge ok={titleAnalysis.hasExclamation} label="感嘆符(!)" />
                  <TitleBadge ok={titleAnalysis.hasYearMonth} label="年月含む" />
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  ✓ = このタイトルに含まれる要素 / – = 含まれない要素
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
