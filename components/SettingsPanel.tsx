'use client';

import { useState } from 'react';
import { AppSettings, Channel, DateRange } from '@/types';
import { addChannel, removeChannel, updateMaxVideos, updateDateRange } from '@/lib/storage';
import { fetchChannelData } from '@/lib/youtube';

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
