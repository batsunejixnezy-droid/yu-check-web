import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const SERVER_API_KEY = process.env.YOUTUBE_API_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'endpointが必要です' }, { status: 400 });
  }

  // ユーザー提供のキーを優先、なければサーバー環境変数を使用
  const userKey = searchParams.get('userKey');
  const activeKey = userKey || SERVER_API_KEY;

  if (!activeKey) {
    return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
  }

  // APIキーを付けてYouTubeにリクエスト
  const params = new URLSearchParams(searchParams);
  params.delete('endpoint');
  params.delete('userKey'); // ユーザーキーはYouTubeに送らない
  params.set('key', activeKey);

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
