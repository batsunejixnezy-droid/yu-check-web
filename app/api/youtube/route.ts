import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const API_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(request: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'endpointが必要です' }, { status: 400 });
  }

  // APIキーを付けてYouTubeにリクエスト
  const params = new URLSearchParams(searchParams);
  params.delete('endpoint');
  params.set('key', API_KEY);

  const youtubeUrl = `${YOUTUBE_API_BASE}/${endpoint}?${params.toString()}`;

  try {
    const response = await fetch(youtubeUrl);
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'YouTube APIへの接続に失敗しました' }, { status: 500 });
  }
}
