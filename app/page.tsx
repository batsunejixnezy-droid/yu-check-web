'use client';

import { useState, useEffect } from 'react';
import { AppSettings, ChannelResult } from '@/types';
import { loadSettings } from '@/lib/storage';
import { analyzeChannel } from '@/lib/youtube';
import SettingsPanel from '@/components/SettingsPanel';
import ChannelCard from '@/components/ChannelCard';
import ViralTab from '@/components/ViralTab';
import PostingTimeTab from '@/components/PostingTimeTab';
import KeywordTab from '@/components/KeywordTab';

type Tab = 'analyze' | 'viral' | 'postingTime' | 'keyword' | 'settings';

const TAB_LABELS: Record<Tab, string> = {
  analyze: '分析',
  viral: '急上昇動画',
  postingTime: '投稿時間',
  keyword: 'キーワード',
  settings: '設定',
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>('analyze');
  const [settings, setSettings] = useState<AppSettings>({
    channels: [],
    maxVideos: 30,
  });
  const [results, setResults] = useState<ChannelResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, channelName: '' });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [selectedChannelIndex, setSelectedChannelIndex] = useState(0);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

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
        const result = await analyzeChannel(channel.channelId, settings.maxVideos);
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

  // タブ順序（設定を右端に）
  const mainTabs: Tab[] = ['analyze', 'viral', 'postingTime', 'keyword'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">ゆーちぇっく</h1>
            <span className="text-xs text-gray-400">YouTubeライバル分析</span>
            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">v2.0</span>
          </div>

          {/* タブ */}
          <nav className="flex gap-1">
            {mainTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
            <div className="w-px bg-gray-200 mx-1" />
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === 'settings'
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
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
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">
                    登録チャンネル: <span className="font-medium text-gray-900">{settings.channels.length}件</span>
                    <span className="mx-2 text-gray-300">|</span>
                    取得本数: <span className="font-medium text-gray-900">{settings.maxVideos}本</span>
                    {lastUpdated && (
                      <>
                        <span className="mx-2 text-gray-300">|</span>
                        最終更新: <span className="text-gray-500">{lastUpdated}</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={isLoading}
                  className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? '分析中...' : '分析を実行'}
                </button>
              </div>

              {/* プログレス */}
              {isLoading && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{progress.channelName} を取得中...</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-red-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 結果がない場合のガイド */}
            {!hasResults && !isLoading && (
              <div className="text-center py-16 text-gray-400">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-sm">
                  {settings.channels.length === 0
                    ? '設定タブでチャンネルを登録してください'
                    : '「分析を実行」ボタンを押してください'}
                </p>
              </div>
            )}

            {/* チャンネルタブ + 結果 */}
            {results.length > 0 && (
              <div className="space-y-4">
                {/* タブバー */}
                <div className="overflow-x-auto">
                  <div className="flex gap-1 min-w-max border-b border-gray-200 pb-0">
                    {results.map((result, index) => (
                      <button
                        key={result.channelId}
                        onClick={() => setSelectedChannelIndex(index)}
                        className={`px-4 py-2 text-sm rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                          selectedChannelIndex === index
                            ? 'border-red-600 text-red-600 font-medium bg-red-50'
                            : result.error
                            ? 'border-transparent text-red-400 hover:text-red-500'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {result.channelName}
                        {result.error && <span className="ml-1 text-xs">(エラー)</span>}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 選択中チャンネルの結果 */}
                {results[selectedChannelIndex] && (
                  <ChannelCard result={results[selectedChannelIndex]} />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'viral' && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <ViralTab results={results} />
          </div>
        )}

        {activeTab === 'postingTime' && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <PostingTimeTab results={results} />
          </div>
        )}

        {activeTab === 'keyword' && (
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <KeywordTab results={results} />
          </div>
        )}
      </main>
    </div>
  );
}
