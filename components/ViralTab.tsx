'use client';

import { ChannelResult, VideoWithMetrics } from '@/types';
import { formatNumber } from '@/lib/youtube';

interface ViralTabProps {
  results: ChannelResult[];
}

interface ViralVideo extends VideoWithMetrics {
  viralRatio: number;
}

export default function ViralTab({ results }: ViralTabProps) {
  // 全チャンネルの急上昇動画を収集
  const viralVideos: ViralVideo[] = [];

  results.forEach((result) => {
    if (result.error) return;

    const allVideos = [...result.longVideos, ...result.shortVideos];
    const channelAvg =
      allVideos.length > 0
        ? allVideos.reduce((sum, v) => sum + v.viewCount, 0) / allVideos.length
        : 0;

    allVideos.forEach((video) => {
      if (video.isViral) {
        viralVideos.push({
          ...video,
          viralRatio: channelAvg > 0 ? video.viewCount / channelAvg : 0,
        });
      }
    });
  });

  // 再生回数順にソート
  viralVideos.sort((a, b) => b.viewCount - a.viewCount);

  if (results.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">先に「分析を実行」してください</p>
      </div>
    );
  }

  if (viralVideos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm">急上昇動画が見つかりませんでした</p>
        <p className="text-xs mt-1">チャンネル内平均の2.5倍以上の再生数が条件です</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">
          急上昇動画
          <span className="ml-2 text-xs text-gray-400">
            （チャンネル内平均の2.5倍以上）
          </span>
        </h2>
        <span className="text-xs text-gray-500">{viralVideos.length}件</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {viralVideos.map((video) => (
          <a
            key={`${video.channelId}-${video.videoId}`}
            href={`https://www.youtube.com/watch?v=${video.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all group"
          >
            {/* サムネイル */}
            <div className="relative aspect-video bg-gray-100">
              {video.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg
                    className="w-10 h-10 text-gray-300"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </div>
              )}
              {/* 急上昇バッジ */}
              <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded">
                {video.viralRatio.toFixed(1)}倍
              </div>
            </div>

            {/* 情報 */}
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors leading-snug">
                {video.title}
              </p>
              <p className="text-xs text-gray-500 mt-1.5">{video.channelName}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-semibold text-gray-900">
                  {formatNumber(video.viewCount)}回
                </span>
                <span className="text-xs text-gray-400">
                  平均比 {video.viralRatio.toFixed(1)}倍
                </span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
