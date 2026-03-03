'use client';

import { useState, useEffect } from 'react';
import { AppSettings, Channel, DateRange } from '@/types';
import { addChannel, removeChannel, updateMaxVideos, updateDateRange } from '@/lib/storage';
import { fetchChannelData } from '@/lib/youtube';
import { addApiKey, removeApiKey, getApiKeyStatus, getExhaustedCount } from '@/lib/apiKeyManager';

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

const DATE_RANGE_OPTIONS: { value: DateRange; label: string; desc: string }[] = [
  { value: '1month', label: '1ヶ月', desc: '最新30日間' },
  { value: '3months', label: '3ヶ月', desc: '最新90日間' },
  { value: '6months', label: '6ヶ月', desc: '最新180日間' },
  { value: '1year', label: '1年', desc: '最新365日間' },
  { value: 'all', label: '全期間', desc: '最大300本' },
];

export default function SettingsPanel({ settings, onSettingsChange }: SettingsPanelProps) {
  const [channelInput, setChannelInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');

  // APIキー管理
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<{ key: string; masked: string; exhausted: boolean }[]>([]);
  const [exhaustedCount, setExhaustedCount] = useState(0);

  useEffect(() => {
    setApiKeyStatus(getApiKeyStatus());
    setExhaustedCount(getExhaustedCount());
  }, []);

  const refreshApiKeyStatus = () => {
    setApiKeyStatus(getApiKeyStatus());
    setExhaustedCount(getExhaustedCount());
  };

  const handleAddApiKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    addApiKey(trimmed);
    setApiKeyInput('');
    refreshApiKeyStatus();
  };

  const handleRemoveApiKey = (key: string) => {
    removeApiKey(key);
    refreshApiKeyStatus();
  };

  const handleAddChannel = async () => {
    const input = channelInput.trim();
    if (!input) return;

    setIsAdding(true);
    setAddError('');

    try {
      const { channelTitle, actualChannelId } = await fetchChannelData(input);

      const newChannel: Channel = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: channelTitle,
        channelId: actualChannelId,
      };

      addChannel(newChannel);
      const newSettings = { ...settings, channels: [...settings.channels, newChannel] };
      onSettingsChange(newSettings);
      setChannelInput('');
    } catch {
      setAddError('チャンネルが見つかりません。チャンネルIDまたはハンドル名を確認してください。');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveChannel = (id: string) => {
    removeChannel(id);
    const newSettings = { ...settings, channels: settings.channels.filter((c) => c.id !== id) };
    onSettingsChange(newSettings);
  };

  const handleMaxVideosChange = (value: number) => {
    updateMaxVideos(value);
    onSettingsChange({ ...settings, maxVideos: value });
  };

  const handleDateRangeChange = (value: DateRange) => {
    updateDateRange(value);
    onSettingsChange({ ...settings, dateRange: value });
  };

  return (
    <div className="space-y-5">
      {/* APIキー管理 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">YouTube APIキー</h2>
          {exhaustedCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
              {exhaustedCount}件 クォータ切れ
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">
          複数のAPIキーを登録するとクォータ切れ時に自動で切り替えます。
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline ml-1"
          >
            Google Cloud Console
          </a>
          で取得できます（無料）。
        </p>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIzaSy... (YouTube Data API v3 キー)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyDown={(e) => e.key === 'Enter' && handleAddApiKey()}
          />
          <button
            onClick={handleAddApiKey}
            disabled={!apiKeyInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors whitespace-nowrap font-medium"
          >
            追加
          </button>
        </div>

        {apiKeyStatus.length > 0 ? (
          <div className="space-y-2">
            {apiKeyStatus.map(({ key, masked, exhausted }) => (
              <div
                key={key}
                className={`flex items-center justify-between py-2 px-3 rounded-lg border ${
                  exhausted ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${exhausted ? 'bg-red-500' : 'bg-green-500'}`} />
                  <span className="text-xs font-mono text-gray-700">{masked}</span>
                  <span className={`text-xs ${exhausted ? 'text-red-600 font-medium' : 'text-green-600'}`}>
                    {exhausted ? 'クォータ切れ (明日リセット)' : '使用可能'}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveApiKey(key)}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors ml-3"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800 font-medium">APIキー未登録</p>
            <p className="text-xs text-yellow-700 mt-0.5">
              現在はサーバー側の共有APIキーを使用中。クォータ（1日10,000ユニット）を節約するため、ご自身のキーを登録することを推奨します。
            </p>
          </div>
        )}

        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 font-medium mb-1">クォータの目安</p>
          <p className="text-xs text-gray-400">
            検索 100ユニット / 動画詳細 1ユニット / チャンネル情報 1ユニット
            → 3チャンネル分析 ≈ 500〜1,500ユニット
          </p>
        </div>
      </div>

      {/* 取得期間 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-1">取得期間</h2>
        <p className="text-xs text-gray-400 mb-4">分析時に直近何ヶ月分の動画を取得するか。期間指定時は全件取得します。</p>
        <div className="flex gap-2 flex-wrap">
          {DATE_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleDateRangeChange(opt.value)}
              title={opt.desc}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors font-medium ${
                settings.dateRange === opt.value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
              }`}
            >
              {opt.label}
              <span className="block text-xs font-normal opacity-60">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 全期間時の最大表示本数 */}
      {settings.dateRange === 'all' && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">最大取得本数（全期間時）</h2>
          <p className="text-xs text-gray-400 mb-4">「全期間」選択時のロング・ショート各カテゴリの最大取得本数</p>
          <div className="flex gap-2">
            {[10, 30, 50, 100].map((n) => (
              <button
                key={n}
                onClick={() => handleMaxVideosChange(n)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  settings.maxVideos === n
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-red-400'
                }`}
              >
                {n}本
              </button>
            ))}
          </div>
        </div>
      )}

      {/* チャンネル登録 */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">ライバルチャンネル登録</h2>

        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={channelInput}
            onChange={(e) => {
              setChannelInput(e.target.value);
              setAddError('');
            }}
            placeholder="UCxxxxxxxxxx または @channelname"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            onKeyDown={(e) => e.key === 'Enter' && !isAdding && handleAddChannel()}
            disabled={isAdding}
          />
          <button
            onClick={handleAddChannel}
            disabled={!channelInput.trim() || isAdding}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap font-medium"
          >
            {isAdding ? '取得中...' : '追加'}
          </button>
        </div>

        {addError && (
          <p className="text-xs text-red-500 mb-3">{addError}</p>
        )}

        {settings.channels.length > 0 && (
          <div className="mt-4 space-y-2">
            {settings.channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between py-2.5 px-4 bg-gray-50 rounded-lg border border-gray-100"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{channel.name}</p>
                  <p className="text-xs text-gray-400 truncate">{channel.channelId}</p>
                </div>
                <button
                  onClick={() => handleRemoveChannel(channel.id)}
                  className="ml-3 text-xs text-gray-400 hover:text-red-600 transition-colors whitespace-nowrap"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}

        {settings.channels.length === 0 && (
          <p className="mt-3 text-xs text-gray-400">チャンネルが登録されていません</p>
        )}
      </div>
    </div>
  );
}
