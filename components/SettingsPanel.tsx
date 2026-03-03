'use client';

import { useState } from 'react';
import { AppSettings, Channel } from '@/types';
import { addChannel, removeChannel, updateMaxVideos } from '@/lib/storage';
import { fetchChannelData } from '@/lib/youtube';

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}

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

  return (
    <div className="space-y-6">
      {/* 取得動画数 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">取得動画数（ロング・ショート各）</h2>
        <div className="flex gap-2">
          {[10, 30, 50, 100].map((n) => (
            <button
              key={n}
              onClick={() => handleMaxVideosChange(n)}
              className={`px-4 py-2 text-sm rounded-md border transition-colors ${
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

      {/* チャンネル登録 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
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
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            onKeyDown={(e) => e.key === 'Enter' && !isAdding && handleAddChannel()}
            disabled={isAdding}
          />
          <button
            onClick={handleAddChannel}
            disabled={!channelInput.trim() || isAdding}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {isAdding ? '取得中...' : '追加'}
          </button>
        </div>

        {addError && (
          <p className="text-xs text-red-500 mb-3">{addError}</p>
        )}

        {/* チャンネル一覧 */}
        {settings.channels.length > 0 && (
          <div className="mt-4 space-y-2">
            {settings.channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{channel.name}</p>
                  <p className="text-xs text-gray-500 truncate">{channel.channelId}</p>
                </div>
                <button
                  onClick={() => handleRemoveChannel(channel.id)}
                  className="ml-3 text-xs text-red-500 hover:text-red-700 whitespace-nowrap"
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
