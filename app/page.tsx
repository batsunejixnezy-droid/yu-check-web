'use client';

import { useState, useEffect } from 'react';
import { AppSettings, ChannelResult, DateRange } from '@/types';
import { loadSettings, saveSettings } from '@/lib/storage';
import { analyzeChannel } from '@/lib/youtube';
import SettingsPanel from '@/components/SettingsPanel';
import ChannelCard from '@/components/ChannelCard';
import ViralTab from '@/components/ViralTab';
import PostingTimeTab from '@/components/PostingTimeTab';
import KeywordTab from '@/components/KeywordTab';
import VideoAnalysisTab from '@/components/VideoAnalysisTab';
import TrendingSearchTab from '@/components/TrendingSearchTab';

type Tab = 'analyze' | 'videoAnalysis' | 'viral' | 'postingTime' | 'keyword' | 'trending' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  analyze: '分析',
  videoAnalysis: '動画分析',
  viral: '急上昇',
  postingTime: '投稿時間',
  keyword: 'キーワード',
  trending: '穴場探し',
  settings: '設定',
};

const DISPLAY_LIMITS = [10, 30, 50] as const;
type DisplayLimit = (typeof DISPLAY_LIMITS)[number];

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: '1month', label: '1ヶ月' },
  { value: '3months', label: '3ヶ月' },
  { value: '6months', label: '6ヶ月' },
  { value: '1year', label: '1年' },
  { value: 'all', label: '全期間' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('analyze');
  const [settings, setSettings] = useState<AppSettings>({
    channels: [],
    maxVideos: 30,
    dateRange: '3months',
  });
  const [results, setResults] = useState<ChannelResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, channelName: '' });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>(30);
  const [analyzeVideoId, setAnalyzeVideoId] = useState<string | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleAnalyzeVideo = (videoId: string) => {
    setAnalyzeVideoId(videoId);
    setActiveTab('videoAnalysis');
  };

  const handleDateRangeChange = (range: DateRange) => {
    const next = { ...settings, dateRange: range };
    setSettings(next);
    saveSettings(next);
  };

  const handleAnalyze = async () => {
    if (settings.channels.length === 0) {
      alert('設定タブでライバルチャンネルを登録してください');
      setActiveTab('settings');
      return;
    }

    setIsLoading(true);
    setResults([]);
    setSelectedChannelIndex(0);
    setProgress({ current: 0, total: settings.channels.length, channelName: '' });

    const newResults: ChannelResult[] = [];

    for (let i = 0; i < settings.channels.length; i++) {
      const channel = settings.channels[i];
      setProgress({ current: i + 1, total: settings.channels.length, channelName: channel.name });

      try {
        const result = await analyzeChannel(channel.channelId, settings.maxVideos, settings.dateRange);
        newResults.push(result);
      } catch (err) {
        newResults.push({
          channelId: channel.channelId,
          channelName: channel.name,
          subscriberCount: 0,
          longVideos: [],
          shortVideos: [],
          error: err instanceof Error ? err.message : '不明なエラー',
        });
      }

      setResults([...newResults]);
    }

    setIsLoading(false);
    setLastUpdated(new Date().toLocaleString('ja-JP'));
  };

  const hasResults = results.length > 0;
  const mainTabs: Tab[] = ['analyze', 'videoAnalysis', 'viral', 'postingTime', 'keyword', 'trending'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">ゆーちぇっく</h1>
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">v2.0</span>
          </div>

          {/* タブ */}
          <nav className="flex gap-0.5 overflow-x-auto flex-1 justify-end">
            {mainTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? tab === 'trending'
                      ? 'bg-orange-500 text-white font-semibold'
                      : 'bg-gray-900 text-white font-semibold'
                    : tab === 'trending'
                    ? 'text-orange-500 hover:bg-orange-50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab === 'trending' ? '🔍 ' : ''}{TAB_LABELS[tab]}
              </button>
            ))}
            <div className="w-px bg-gray-200 mx-1 self-stretch" />
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === 'settings'
                  ? 'bg-gray-900 text-white font-semibold'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {TAB_LABELS.settings}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'settings' && (
          <SettingsPanel settings={settings} onSettingsChange={setSettings} />
        )}

        {activeTab === 'analyze' && (
          <div className="space-y-5">
            {/* 実行エリア */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-3 flex-1">
                  {/* チャンネル数と更新日時 */}
                  <p className="text-sm text-gray-500">
                    <span className="font-semibold text-gray-900">{settings.channels.length}</span> チャンネル
                    {lastUpdated && (
                      <>
                        <span className="mx-2 text-gray-200">|</span>
                        <span>更新: {lastUpdated}</span>
                      </>
                    )}
                  </p>

                  {/* 取得期間 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-gray-500">取得期間:</span>
                    <div className="flex gap-1 flex-wrap">
                      {DATE_RANGE_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => handleDateRangeChange(opt.value)}
                          className={`px-3 py-1 text-xs rounded-full border transition-all font-medium ${
                            settings.dateRange === opt.value
                              ? 'bg-gray-900 text-white border-gray-900'
                              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 表示本数（結果がある時だけ） */}
                  {hasResults && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500">表示本数:</span>
                      <div className="flex gap-1">
                        {DISPLAY_LIMITS.map((n) => (
                          <button
                            key={n}
                            onClick={() => setDisplayLimit(n)}
                            className={`px-3 py-1 text-xs rounded-full border transition-all font-medium ${
                              displayLimit === n
                                ? 'bg-gray-900 text-white border-gray-900'
                                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {n}本
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="px-6 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap"
                >
                  {isLoading ? '分析中...' : '分析を実行'}
                </button>
              </div>

              {/* プログレス */}
              {isLoading && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span className="font-medium">{progress.channelName} を取得中...</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-red-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 結果がない場合 */}
            {!hasResults && !isLoading && (
              <div className="text-center py-20 text-gray-400">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm font-medium">
                  {settings.channels.length === 0
                    ? '設定タブでチャンネルを登録してください'
                    : '取得期間を選んで「分析を実行」を押してください'}
                </p>
              </div>
            )}

            {/* チャンネルタブ + 結果 */}
            {hasResults && (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <div className="flex gap-0.5 min-w-max border-b border-gray-200">
                    {results.map((result, index) => (
                      <button
                        key={result.channelId}
                        onClick={() => setSelectedChannelIndex(index)}
                        className={`px-4 py-2.5 text-sm rounded-t-lg border-b-2 transition-all whitespace-nowrap ${
                          selectedChannelIndex === index
                            ? 'border-red-600 text-red-600 font-semibold bg-red-50'
                            : result.error
                            ? 'border-transparent text-red-400 hover:text-red-500'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {result.channelName}
                        {result.error && <span className="ml-1 text-xs opacity-70">(エラー)</span>}
                        {!result.error && (
                          <span className="ml-1.5 text-xs opacity-60">
                            {result.longVideos.length + result.shortVideos.length}本
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {results[selectedChannelIndex] && (
                  <ChannelCard
                    result={results[selectedChannelIndex]}
                    displayLimit={displayLimit}
                    dateRange={settings.dateRange}
                    onAnalyzeVideo={handleAnalyzeVideo}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'videoAnalysis' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <VideoAnalysisTab initialVideoId={analyzeVideoId} />
          </div>
        )}

        {activeTab === 'viral' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <ViralTab results={results} />
          </div>
        )}

        {activeTab === 'postingTime' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <PostingTimeTab results={results} />
          </div>
        )}

        {activeTab === 'keyword' && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <KeywordTab results={results} />
          </div>
        )}

        {activeTab === 'trending' && (
          <TrendingSearchTab />
        )}
      </main>
    </div>
  );
}
