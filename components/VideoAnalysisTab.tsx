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

// Catmull-Rom → Cubic Bezier でなめらかな曲線を生成
function smoothCurvePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 5;
    const cp1y = p1.y + (p2.y - p0.y) / 5;
    const cp2x = p2.x - (p3.x - p1.x) / 5;
    const cp2y = p2.y - (p3.y - p1.y) / 5;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function ChannelTrendChart({ videos, avgViews }: { videos: RecentVideoPoint[]; avgViews: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  if (videos.length === 0) return null;

  const display = videos.slice(-20);
  const W = 640;
  const H = 220;
  const PAD = { top: 20, right: 20, bottom: 36, left: 58 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxViews = Math.max(...display.map((v) => v.viewCount), 1);
  // 最小値は0かデータの最小値の少し下
  const dataMin = Math.min(...display.map((v) => v.viewCount));
  const minViews = Math.max(0, dataMin - (maxViews - dataMin) * 0.15);
  const range = maxViews - minViews || 1;

  const xOf = (i: number) => PAD.left + (i / (display.length - 1 || 1)) * innerW;
  const yOf = (v: number) => PAD.top + innerH - ((v - minViews) / range) * innerH;

  const pts = display.map((v, i) => ({ x: xOf(i), y: yOf(v.viewCount) }));
  const linePath = smoothCurvePath(pts);

  // エリアのクローズパス
  const areaPath = `${linePath} L${xOf(display.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;

  // Y軸ラベル（4本）
  const yTicks = Array.from({ length: 4 }, (_, i) => minViews + (range / 3) * (3 - i));

  // 平均ライン
  const avgY = yOf(Math.max(minViews, Math.min(avgViews, maxViews)));
  const showAvg = avgViews > 0 && avgY >= PAD.top && avgY <= PAD.top + innerH;

  // ホバー情報
  const hovered = hoveredIdx !== null ? display[hoveredIdx] : null;
  const hovX = hoveredIdx !== null ? xOf(hoveredIdx) : 0;
  const hovY = hoveredIdx !== null ? yOf(display[hoveredIdx].viewCount) : 0;
  const tooltipOnLeft = hovX > W * 0.6;

  // diffFromAvg の色
  const diffColor = (v: RecentVideoPoint) => {
    if (avgViews === 0) return '#6b7280';
    const d = (v.viewCount - avgViews) / avgViews * 100;
    return d >= 20 ? '#16a34a' : d <= -20 ? '#dc2626' : '#6b7280';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* ヘッダー */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">チャンネル 再生数推移</h3>
            <p className="text-xs text-gray-400 mt-0.5">直近{display.length}本 / 古い順 → 新しい順</p>
          </div>
          {avgViews > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-400">チャンネル平均</p>
              <p className="text-sm font-bold text-amber-600">{formatNumber(avgViews)}回</p>
            </div>
          )}
        </div>
      </div>

      {/* チャート */}
      <div className="relative px-2 py-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: '220px' }}
        >
          <defs>
            <linearGradient id="ytGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="75%" stopColor="#2563eb" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
            <clipPath id="chartClip">
              <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} />
            </clipPath>
          </defs>

          {/* Y軸グリッド */}
          {yTicks.map((val, i) => {
            const y = yOf(val);
            return (
              <g key={i}>
                <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
                  stroke="#f3f4f6" strokeWidth={i === 0 ? 1.5 : 1} />
                <text x={PAD.left - 8} y={y + 4} fontSize="10" fill="#9ca3af" textAnchor="end">
                  {formatNumber(Math.round(val))}
                </text>
              </g>
            );
          })}

          {/* X軸ベースライン */}
          <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
            stroke="#e5e7eb" strokeWidth="1" />

          {/* 平均ライン */}
          {showAvg && (
            <g>
              <line x1={PAD.left} y1={avgY} x2={PAD.left + innerW} y2={avgY}
                stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6,4" opacity="0.8" />
              <text x={PAD.left + innerW + 4} y={avgY + 4} fontSize="9" fill="#f59e0b">avg</text>
            </g>
          )}

          {/* エリア & ライン（クリップ適用） */}
          <g clipPath="url(#chartClip)">
            <path d={areaPath} fill="url(#ytGrad)" />
            <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5"
              strokeLinejoin="round" strokeLinecap="round" />
          </g>

          {/* ホバー縦線 */}
          {hoveredIdx !== null && (
            <line x1={hovX} y1={PAD.top} x2={hovX} y2={PAD.top + innerH}
              stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4,3"
              style={{ pointerEvents: 'none' }} />
          )}

          {/* ドット（分析対象 & ホバー） */}
          {display.map((v, i) => {
            const cx = xOf(i);
            const cy = yOf(v.viewCount);
            const isHov = hoveredIdx === i;
            if (!v.isTarget && !isHov) return null;
            return (
              <g key={v.videoId} style={{ pointerEvents: 'none' }}>
                {v.isTarget && (
                  <circle cx={cx} cy={cy} r={8} fill="#2563eb" opacity="0.15" />
                )}
                <circle cx={cx} cy={cy}
                  r={v.isTarget ? 5.5 : 4}
                  fill={v.isTarget ? '#2563eb' : '#60a5fa'}
                  stroke="white" strokeWidth="2.5" />
              </g>
            );
          })}

          {/* ホバー用透明領域 */}
          {display.map((v, i) => (
            <rect key={v.videoId}
              x={i === 0 ? PAD.left : (xOf(i - 1) + xOf(i)) / 2}
              y={PAD.top}
              width={i === 0
                ? (xOf(0) + xOf(1)) / 2 - PAD.left
                : i === display.length - 1
                  ? PAD.left + innerW - (xOf(i - 1) + xOf(i)) / 2
                  : (xOf(i + 1) - xOf(i - 1)) / 2}
              height={innerH}
              fill="transparent"
              style={{ cursor: 'crosshair' }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}

          {/* X軸日付ラベル */}
          {display.map((v, i) => {
            const step = Math.ceil(display.length / 7);
            if (i % step !== 0 && i !== display.length - 1) return null;
            return (
              <text key={i} x={xOf(i)} y={H - 6}
                fontSize="10" fill={v.isTarget ? '#2563eb' : '#9ca3af'}
                textAnchor="middle" fontWeight={v.isTarget ? '700' : '400'}>
                {formatShortDate(v.publishedAt)}
              </text>
            );
          })}
        </svg>

        {/* ホバーツールチップ */}
        {hovered && (
          <div
            className="absolute top-4 pointer-events-none z-20"
            style={tooltipOnLeft
              ? { right: `${W - hovX + 12}px` }
              : { left: `${hovX + 12}px` }}
          >
            <div className="bg-gray-950 text-white rounded-xl shadow-xl px-4 py-3 min-w-[160px]">
              <p className="text-xs text-gray-400 mb-1 truncate max-w-[180px]">{hovered.title}</p>
              <p className="text-xl font-bold leading-none">{formatNumber(hovered.viewCount)}<span className="text-sm font-normal ml-1">回</span></p>
              {avgViews > 0 && (
                <p className="text-xs mt-1" style={{ color: diffColor(hovered) }}>
                  {hovered.viewCount >= avgViews ? '+' : ''}
                  {(((hovered.viewCount - avgViews) / avgViews) * 100).toFixed(0)}% vs 平均
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">{formatShortDate(hovered.publishedAt)}</p>
              {hovered.isTarget && (
                <div className="mt-1.5 px-2 py-0.5 bg-blue-600 rounded-full text-xs text-center font-medium">
                  分析対象
                </div>
              )}
            </div>
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
