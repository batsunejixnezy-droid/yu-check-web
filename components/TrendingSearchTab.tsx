'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { TrendingVideo, TrendSearchRange, searchTrendingVideos, formatNumber, formatDuration } from '@/lib/youtube';
import { loadSavedKeywords, saveKeyword, removeSavedKeyword } from '@/lib/storage';

type SortMode = 'velocity' | 'views' | 'newest' | 'oldest';
type MaxViewsFilter = 'all' | '100k' | '500k' | '1m';
type VideoTypeFilter = 'all' | 'long' | 'short';
type LanguageFilter = 'ja' | 'en' | 'all';

const RANGE_OPTIONS: { value: TrendSearchRange; label: string; desc: string }[] = [
  { value: '1week', label: '1週間', desc: '超直近トレンド' },
  { value: '2weeks', label: '2週間', desc: '今のトレンド' },
  { value: '1month', label: '1ヶ月', desc: '月間トレンド' },
  { value: '3months', label: '3ヶ月', desc: '季節トレンド' },
];

const MAX_VIEWS_OPTIONS: { value: MaxViewsFilter; label: string; max: number }[] = [
  { value: 'all', label: 'すべて', max: Infinity },
  { value: '100k', label: '〜10万', max: 100000 },
  { value: '500k', label: '〜50万', max: 500000 },
  { value: '1m', label: '〜100万', max: 1000000 },
];

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const dow = DAY_LABELS[d.getDay()];
  return `${m}/${day}(${dow})`;
}

function VelocityBadge({ vpd }: { vpd: number }) {
  if (vpd >= 100000) return <span className="text-xs font-bold text-red-600">🔥🔥🔥 超急上昇</span>;
  if (vpd >= 10000) return <span className="text-xs font-bold text-orange-500">🔥🔥 急上昇</span>;
  if (vpd >= 1000) return <span className="text-xs font-bold text-yellow-500">🔥 上昇中</span>;
  return <span className="text-xs text-gray-400">— 通常</span>;
}

function VelocityBar({ vpd, maxVpd }: { vpd: number; maxVpd: number }) {
  const pct = maxVpd > 0 ? (vpd / maxVpd) * 100 : 0;
  const color =
    pct >= 75 ? 'bg-red-500' : pct >= 45 ? 'bg-orange-400' : pct >= 20 ? 'bg-yellow-400' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 bg-gray-100 rounded-full h-2 min-w-[60px]">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-20 text-right">
        {formatNumber(vpd)}/日
      </span>
    </div>
  );
}

const EXAMPLE_QUERIES_JA = ['一人旅 国内', '筋トレ 初心者', '料理 時短', 'ASMR 睡眠', 'vlog 日常', '英語 勉強法'];
const EXAMPLE_QUERIES_EN = ['solo travel', 'workout beginner', 'easy cooking', 'ASMR sleep', 'daily vlog', 'study with me'];

// ショート動画の閾値 (秒) - アプリ内の SHORT_VIDEO_THRESHOLD と統一
const SHORTS_THRESHOLD = 180;

interface TrendingSearchTabProps {
  onKeywordsChange?: (count: number) => void;
}

export default function TrendingSearchTab({ onKeywordsChange }: TrendingSearchTabProps) {
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<TrendSearchRange>('1month');
  const [sortMode, setSortMode] = useState<SortMode>('velocity');
  const [maxViewsFilter, setMaxViewsFilter] = useState<MaxViewsFilter>('all');
  const [videoTypeFilter, setVideoTypeFilter] = useState<VideoTypeFilter>('all');
  const [language, setLanguage] = useState<LanguageFilter>('ja');
  const [isLoading, setIsLoading] = useState(false);
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [searchedRange, setSearchedRange] = useState<TrendSearchRange>('1month');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // キーワード保存
  const [savedKeywords, setSavedKeywords] = useState<string[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<{ keyword: string; topVideo: TrendingVideo | null }[]>([]);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    setSavedKeywords(loadSavedKeywords());
  }, []);

  const handleSaveKeyword = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveKeyword(trimmed);
    const next = loadSavedKeywords();
    setSavedKeywords(next);
    onKeywordsChange?.(next.length);
  };

  const handleRemoveKeyword = (kw: string) => {
    removeSavedKeyword(kw);
    const next = loadSavedKeywords();
    setSavedKeywords(next);
    onKeywordsChange?.(next.length);
  };

  const handleCheckAll = async () => {
    if (savedKeywords.length === 0) return;
    setIsChecking(true);
    setCheckResults([]);
    setShowNotification(false);

    const results: { keyword: string; topVideo: TrendingVideo | null }[] = [];
    for (const kw of savedKeywords) {
      try {
        const res = await searchTrendingVideos(kw, '1week', language, 5);
        results.push({ keyword: kw, topVideo: res[0] ?? null });
      } catch {
        results.push({ keyword: kw, topVideo: null });
      }
    }

    setCheckResults(results);
    const hasResults = results.some((r) => r.topVideo !== null);
    if (hasResults) setShowNotification(true);
    setIsChecking(false);
  };

  const handleSearch = async (q?: string, lang?: LanguageFilter) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;

    setIsLoading(true);
    setError('');
    setVideos([]);

    try {
      const useLang = lang ?? language;
      const results = await searchTrendingVideos(searchQuery, dateRange, useLang, 100);
      setVideos(results);
      setSearchedQuery(searchQuery);
      setSearchedRange(dateRange);
    } catch (err) {
      setError(err instanceof Error ? err.message : '検索中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const maxFilter = MAX_VIEWS_OPTIONS.find((o) => o.value === maxViewsFilter)?.max ?? Infinity;
  const filtered = videos
    .filter((v) => v.viewCount <= maxFilter)
    .filter((v) => {
      if (videoTypeFilter === 'short') return v.duration <= SHORTS_THRESHOLD;
      if (videoTypeFilter === 'long') return v.duration > SHORTS_THRESHOLD;
      return true;
    });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'velocity': return b.viewsPerDay - a.viewsPerDay;
      case 'views': return b.viewCount - a.viewCount;
      case 'newest': return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case 'oldest': return new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    }
  });

  const maxVpd = sorted.length > 0 ? Math.max(...sorted.map((v) => v.viewsPerDay)) : 1;

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === searchedRange)?.label ?? '';

  return (
    <div className="space-y-5">
      {/* ヘッダー説明 */}
      <div className="bg-gradient-to-r from-orange-50 to-yellow-50 border border-orange-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🔍</div>
          <div>
            <h2 className="font-bold text-gray-900 mb-1">穴場キーワード探索</h2>
            <p className="text-sm text-gray-600">
              キーワードを入力して、<span className="font-semibold text-orange-600">急上昇中の動画</span>を発見。
              「再生/日」が高い＝今まさに伸びている企画。視聴者が集まっている<span className="font-semibold">旬のテーマ</span>をいち早くキャッチ。
            </p>
          </div>
        </div>
      </div>

      {/* 検索フォーム */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        {/* キーワード入力 */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSearch()}
            placeholder="例: 一人旅 国内、筋トレ 初心者、料理 時短..."
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSearch()}
            disabled={isLoading || !query.trim()}
            className="px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shadow-sm"
          >
            {isLoading ? '検索中...' : '検索する'}
          </button>
        </div>

        {/* 例キーワード */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">例:</span>
          {(language === 'en' ? EXAMPLE_QUERIES_EN : EXAMPLE_QUERIES_JA).map((q) => (
            <button
              key={q}
              onClick={() => {
                setQuery(q);
                handleSearch(q);
              }}
              className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-orange-100 hover:text-orange-700 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* オプション */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 pt-1 border-t border-gray-100">
          {/* 言語 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">言語:</span>
            <div className="flex gap-1">
              {([
                { value: 'ja', label: '日本語' },
                { value: 'en', label: '海外(英語)' },
                { value: 'all', label: 'すべて' },
              ] as { value: LanguageFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setLanguage(opt.value)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                    language === opt.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 動画タイプ */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">タイプ:</span>
            <div className="flex gap-1">
              {([
                { value: 'all', label: 'すべて' },
                { value: 'long', label: 'ロング' },
                { value: 'short', label: 'ショート' },
              ] as { value: VideoTypeFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setVideoTypeFilter(opt.value)}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                    videoTypeFilter === opt.value
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 期間 */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">投稿期間:</span>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDateRange(opt.value)}
                  title={opt.desc}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                    dateRange === opt.value
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 最大再生数フィルター（穴場絞り込み） */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">再生数上限:</span>
            <div className="flex gap-1">
              {MAX_VIEWS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMaxViewsFilter(opt.value)}
                  title={opt.value === 'all' ? '制限なし' : `${opt.label}以下の穴場を探す`}
                  className={`px-3 py-1 text-xs rounded-full border font-medium transition-all ${
                    maxViewsFilter === opt.value
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* キーワード保存ボタン（検索後に表示） */}
      {query.trim() && (
        <div className="flex items-center justify-end">
          <button
            onClick={handleSaveKeyword}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              savedKeywords.includes(query.trim())
                ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                : 'border-gray-300 text-gray-500 hover:border-yellow-400 hover:text-yellow-600 hover:bg-yellow-50'
            }`}
          >
            {savedKeywords.includes(query.trim()) ? '★ 保存済み' : '☆ このキーワードを保存'}
          </button>
        </div>
      )}

      {/* 保存キーワード */}
      {savedKeywords.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-yellow-800">保存中のキーワード ({savedKeywords.length}件)</p>
            <button
              onClick={handleCheckAll}
              disabled={isChecking}
              className="text-xs px-3 py-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors font-medium"
            >
              {isChecking ? 'チェック中...' : '一括チェック (直近1週間)'}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {savedKeywords.map((kw) => (
              <div key={kw} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-yellow-300 rounded-full">
                <button
                  onClick={() => {
                    setQuery(kw);
                    handleSearch(kw);
                  }}
                  className="text-xs text-gray-700 hover:text-orange-600 transition-colors font-medium"
                >
                  {kw}
                </button>
                <button
                  onClick={() => handleRemoveKeyword(kw)}
                  className="text-gray-400 hover:text-red-500 text-xs leading-none ml-0.5"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* 一括チェック結果 */}
          {checkResults.length > 0 && (
            <div className="border-t border-yellow-200 pt-3 space-y-2">
              <p className="text-xs font-medium text-yellow-800">直近1週間の急上昇トップ</p>
              {checkResults.map(({ keyword, topVideo }) => (
                <div key={keyword} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-yellow-100">
                  <span className="text-xs font-semibold text-orange-600 min-w-[80px] truncate">{keyword}</span>
                  {topVideo ? (
                    <a
                      href={`https://www.youtube.com/watch?v=${topVideo.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-xs text-gray-700 hover:text-orange-600 truncate"
                    >
                      {topVideo.title}
                    </a>
                  ) : (
                    <span className="text-xs text-gray-400">該当なし</span>
                  )}
                  {topVideo && (
                    <span className="text-xs font-semibold text-gray-600 whitespace-nowrap flex-shrink-0">
                      {formatNumber(topVideo.viewsPerDay)}/日
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 通知バナー */}
      {showNotification && (
        <div className="bg-green-50 border border-green-300 rounded-xl p-4 flex items-start gap-3">
          <span className="text-green-600 text-lg flex-shrink-0">🔔</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">急上昇中の動画があります！</p>
            <p className="text-xs text-green-700 mt-0.5">保存キーワードで直近1週間に急上昇している動画が見つかりました。上の結果を確認してください。</p>
          </div>
          <button onClick={() => setShowNotification(false)} className="text-green-500 hover:text-green-700 text-sm">×</button>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ローディング */}
      {isLoading && (
        <div className="text-center py-16">
          <div className="inline-flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">YouTube を検索中...</p>
          </div>
        </div>
      )}

      {/* 検索結果 */}
      {!isLoading && sorted.length > 0 && (
        <div className="space-y-3">
          {/* 結果ヘッダー */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <span className="text-sm font-semibold text-gray-900">
                「{searchedQuery}」の急上昇動画
              </span>
              <span className="text-sm text-gray-500 ml-2">
                直近{rangeLabel} / {sorted.length}件
                {videoTypeFilter !== 'all' && (
                  <span className="ml-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                    {videoTypeFilter === 'short' ? 'ショートのみ' : 'ロングのみ'}
                  </span>
                )}
                {language !== 'all' && (
                  <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                    {language === 'ja' ? '日本語' : '海外(英語)'}
                  </span>
                )}
                {maxViewsFilter !== 'all' && (
                  <span className="ml-1 text-orange-600 text-xs">再生数絞り込み中</span>
                )}
              </span>
            </div>
            {/* ソート */}
            <div className="flex gap-1">
              {([
                { key: 'velocity', label: '急上昇順' },
                { key: 'views', label: '再生数順' },
                { key: 'newest', label: '新着順' },
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
                  <th className="text-left py-3 px-3 font-medium min-w-[300px]">動画</th>
                  <th className="text-right py-3 px-3 font-medium">再生数</th>
                  <th className="text-left py-3 px-3 font-medium min-w-[200px]">
                    急上昇度 (再生/日)
                    <span className="ml-1 text-gray-400 font-normal">※高いほど今伸びてる</span>
                  </th>
                  <th className="text-right py-3 px-3 font-medium">公開日</th>
                  <th className="text-right py-3 px-3 font-medium">経過</th>
                  <th className="text-right py-3 px-3 font-medium">長さ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sorted.map((video, idx) => (
                  <tr key={video.videoId} className="hover:bg-orange-50 transition-colors group">
                    {/* # */}
                    <td className="py-3 pl-4 pr-2">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-orange-100 text-orange-700' :
                        idx <= 2 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {idx + 1}
                      </span>
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
                            className="text-sm font-medium text-gray-900 hover:text-orange-600 transition-colors line-clamp-2 leading-snug"
                          >
                            {video.title}
                          </a>
                          <a
                            href={`https://www.youtube.com/channel/${video.channelId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-orange-500 mt-1 block truncate"
                          >
                            {video.channelName}
                          </a>
                          <div className="mt-1">
                            <VelocityBadge vpd={video.viewsPerDay} />
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 再生数 */}
                    <td className="py-3 px-3 text-right font-bold text-gray-900 tabular-nums whitespace-nowrap">
                      {formatNumber(video.viewCount)}
                      <span className="block text-xs font-normal text-gray-400">
                        👍 {formatNumber(video.likeCount)}
                      </span>
                    </td>

                    {/* 急上昇バー */}
                    <td className="py-3 px-3 min-w-[200px]">
                      <VelocityBar vpd={video.viewsPerDay} maxVpd={maxVpd} />
                    </td>

                    {/* 公開日 */}
                    <td className="py-3 px-3 text-right text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(video.publishedAt)}
                    </td>

                    {/* 経過日数 */}
                    <td className="py-3 px-3 text-right text-gray-400 text-xs whitespace-nowrap tabular-nums">
                      {video.daysOld}日前
                    </td>

                    {/* 長さ */}
                    <td className="py-3 px-3 text-right text-gray-500 tabular-nums text-sm whitespace-nowrap">
                      {formatDuration(video.duration)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 穴場ヒント */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-700">
            <span className="font-bold">穴場の見つけ方:</span>
            再生数フィルターを「〜10万」「〜50万」に絞ると、まだ大手が参入していない伸び始めの企画を発見できます。
            「急上昇度（再生/日）」が高い＝今まさに伸びているテーマです。
          </div>
        </div>
      )}

      {/* 検索後に0件 */}
      {!isLoading && searchedQuery && sorted.length === 0 && videos.length > 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">フィルター条件に合う動画がありません。再生数上限を上げてみてください。</p>
        </div>
      )}

      {/* 未検索 */}
      {!isLoading && !searchedQuery && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-sm font-medium text-gray-500">キーワードを入力して穴場を探そう</p>
          <p className="text-xs mt-2">例: 「一人旅 国内」「筋トレ 初心者」「料理 時短」</p>
        </div>
      )}
    </div>
  );
}
