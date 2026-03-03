'use client';

import Image from 'next/image';
import { VideoWithMetrics } from '@/types';
import { formatDuration, formatNumber } from '@/lib/youtube';

interface VideoTableProps {
  videos: VideoWithMetrics[];
  videoType: 'long' | 'short';
}

function getRankBadgeClass(rank: number): string {
  if (rank <= 3) return 'bg-green-100 text-green-800';
  if (rank >= 8) return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

function getDiffClass(diff: number): string {
  if (diff > 20) return 'text-green-600';
  if (diff < -20) return 'text-red-500';
  return 'text-gray-500';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export default function VideoTable({ videos, videoType }: VideoTableProps) {
  if (videos.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">該当する動画がありません</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs text-gray-500">
            <th className="text-left py-2 pr-4 font-medium w-8">順位</th>
            <th className="text-left py-2 pr-4 font-medium min-w-[240px]">動画</th>
            <th className="text-right py-2 pr-4 font-medium">再生回数</th>
            <th className="text-right py-2 pr-4 font-medium">投稿日</th>
            <th className="text-right py-2 pr-4 font-medium">長さ</th>
            {videoType === 'long' ? (
              <th className="text-right py-2 font-medium">登録者再生率</th>
            ) : (
              <th className="text-right py-2 font-medium">平均比</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {videos.map((video) => (
            <tr key={video.videoId} className="hover:bg-gray-50 transition-colors">
              <td className="py-3 pr-4">
                <span
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${getRankBadgeClass(video.rank)}`}
                >
                  {video.rank}
                </span>
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-start gap-3">
                  {video.thumbnailUrl && (
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
                        className="rounded object-cover"
                        unoptimized
                      />
                    </a>
                  )}
                  <div className="min-w-0">
                    <a
                      href={`https://www.youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-900 hover:text-red-600 line-clamp-2 leading-snug"
                    >
                      {video.title}
                    </a>
                    <p className="text-xs text-gray-400 mt-0.5">{video.channelName}</p>
                  </div>
                </div>
              </td>
              <td className="py-3 pr-4 text-right font-medium text-gray-900">
                {formatNumber(video.viewCount)}
              </td>
              <td className="py-3 pr-4 text-right text-gray-500">
                {formatDate(video.publishedAt)}
              </td>
              <td className="py-3 pr-4 text-right text-gray-500">
                {formatDuration(video.duration)}
              </td>
              <td className="py-3 text-right">
                <span className={`font-medium ${getDiffClass(video.diffFromAverage)}`}>
                  {videoType === 'long'
                    ? `${video.engagementRate.toFixed(1)}%`
                    : `${video.diffFromAverage >= 0 ? '+' : ''}${video.diffFromAverage.toFixed(0)}%`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
