'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { VideoAnalysisData, RecentVideoPoint, fetchVideoAnalysis, formatNumber, formatDuration } from '@/lib/youtube';

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

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function ChannelTrendChart({ videos, avgViews }: { videos: RecentVideoPoint[]; avgViews: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (videos.length === 0) return null;

  const display = videos.slice(-20);
  const W = 600;
  const H = 160;
  const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxViews = Math.max(...display.map((v) => v.viewCount), 1);
  const minViews = Math.min(...display.map((v) => v.viewCount), 0);
  const range = maxViews - minViews || 1;

  const xOf = (i: number) => PAD.left + (i / (display.length - 1 || 1)) * innerW;
  const yOf = (v: number) => PAD.top + innerH - ((v - minViews) / range) * innerH;

  // 折れ線のパス
  const linePath = display
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(v.viewCount).toFixed(1)}`)
    .join(' ');

  // グラデーション塗りつぶし
  const areaPath = `${linePath} L${xOf(display.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Y軸ラベル（3本）
  const yLabels = [maxViews, (maxViews + minViews) / 2, minViews];

  // 平均ラインのY座標
  const avgY = yOf(Math.min(avgViews, maxViews));

  const hovered = hoveredIdx !== null ? display[hoveredIdx] : null;
  const tooltipX = hoveredIdx !== null ? xOf(hoveredIdx) : 0;
  const tooltipY = hoveredIdx !== null ? yOf(display[hoveredIdx].viewCount) : 0;
  const tooltipLeft = tooltipX > W * 0.65;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-1">チャンネル 再生数推移 (直近{display.length}本)</h3>
      <p className="text-xs text-gray-400 mb-3">古い順 → 新しい順 / 青点: 分析動画</p>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ minWidth: '280px', height: '160px' }}
        >
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Y軸グリッド & ラベル */}
          {yLabels.map((val, i) => {
            const y = yOf(val);
            return (
              <g key={i}>
                <line
                  x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
                  stroke="#e5e7eb" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3,3'}
                />
                <text
                  x={PAD.left - 6} y={y + 4}
                  fontSize="10" fill="#9ca3af" textAnchor="end"
                >
                  {formatNumber(val)}
                </text>
              </g>
            );
          })}

          {/* 平均ライン */}
          {avgViews > 0 && avgY >= PAD.top && avgY <= PAD.top + innerH && (
            <line
              x1={PAD.left} y1={avgY} x2={PAD.left + innerW} y2={avgY}
              stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,3"
            />
          )}

          {/* エリア塗りつぶし */}
          <path d={areaPath} fill="url(#trendGrad)" />

          {/* 折れ線 */}
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {/* ホバー領域 & 点 */}
          {display.map((v, i) => {
            const cx = xOf(i);
            const cy = yOf(v.viewCount);
            const isHovered = hoveredIdx === i;
            return (
              <g key={v.videoId}>
                {/* ホバー用の広い透明領域 */}
                <rect
                  x={cx - (innerW / display.length / 2)}
                  y={PAD.top}
                  width={innerW / display.length}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{ cursor: 'crosshair' }}
                />
                {/* ドット */}
                {(v.isTarget || isHovered) && (
                  <circle
                    cx={cx} cy={cy}
                    r={v.isTarget ? 5 : 3.5}
                    fill={v.isTarget ? '#3b82f6' : '#93c5fd'}
                    stroke="white" strokeWidth="2"
                    style={{ pointerEvents: 'none' }}
                  />
                )}
              </g>
            );
          })}

          {/* X軸日付（間引き表示） */}
          {display.map((v, i) => {
            if (display.length <= 10 || i % Math.ceil(display.length / 8) === 0 || i === display.length - 1) {
              return (
                <text
                  key={i}
                  x={xOf(i)} y={H - 4}
                  fontSize="9" fill={v.isTarget ? '#3b82f6' : '#9ca3af'}
                  textAnchor="middle"
                  fontWeight={v.isTarget ? 'bold' : 'normal'}
                >
                  {formatShortDate(v.publishedAt)}
                </text>
              );
            }
            return null;
          })}

          {/* ホバー縦線 */}
          {hoveredIdx !== null && (
            <line
              x1={tooltipX} y1={PAD.top} x2={tooltipX} y2={PAD.top + innerH}
              stroke="#d1d5db" strokeWidth="1" strokeDasharray="3,2"
              style={{ pointerEvents: 'none' }}
            />
          )}
        </svg>

        {/* ホバーツールチップ（SVG外でHTMLとして表示） */}
        {hovered && (
          <div
            className="absolute top-2 pointer-events-none z-10"
            style={{ [tooltipLeft ? 'right' : 'left']: `${tooltipLeft ? W - tooltipX + 8 : tooltipX + 8}px`, transform: 'none' }}
          >
            <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap max-w-[220px]">
              <p className="truncate max-w-[200px] text-gray-300 mb-0.5">{hovered.title}</p>
              <p className="font-bold text-sm">{formatNumber(hovered.viewCount)}回</p>
              <p className="text-gray-400">{formatShortDate(hovered.publishedAt)}</p>
              {hovered.isTarget && <p className="text-blue-300 font-medium mt-0.5">← 分析対象</p>}
            </div>
          </div>
        )}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 mt-2 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-0.5 bg-blue-500" />
          <span className="text-xs text-gray-500">再生数推移</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-white shadow-sm flex-shrink-0" style={{ width: '10px', height: '10px' }} />
          <span className="text-xs text-gray-500">分析対象動画</span>
        </div>
        {avgViews > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-0 border-t-2 border-dashed border-amber-400" />
            <span className="text-xs text-gray-500">平均 {formatNumber(avgViews)}回</span>
          </div>
        )}
      </div>
    </div>
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

          {/* チャンネル推移チャート */}
          {data.recentVideos.length > 1 && (
            <ChannelTrendChart videos={data.recentVideos} avgViews={data.channelAvgViews} />
          )}

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
