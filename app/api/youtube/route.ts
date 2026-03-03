import { NextRequest, NextResponse } from 'next/server';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// 複数のサーバーAPIキー（環境変数で管理）
const SERVER_API_KEYS = [
  process.env.YOUTUBE_API_KEY,
  process.env.YOUTUBE_API_KEY_2,
  process.env.YOUTUBE_API_KEY_3,
].filter(Boolean) as string[];

function isQuotaExceeded(data: { error?: { errors?: { reason?: string }[] } }): boolean {
  return data?.error?.errors?.some((e) => e.reason === 'quotaExceeded') ?? false;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ error: 'endpointが必要です' }, { status: 400 });
  }

  const params = new URLSearchParams(searchParams);
  params.delete('endpoint');
  params.delete('userKey'); // 旧互換: ユーザーキーパラメータは無視

  if (SERVER_API_KEYS.length === 0) {
    return NextResponse.json({ error: 'APIキーが設定されていません' }, { status: 500 });
  }

  // サーバーキーを順番に試してクォータ切れなら次へ
  let lastData: unknown = null;
  for (const key of SERVER_API_KEYS) {
    params.set('key', key);
    const youtubeUrl = `${YOUTUBE_API_BASE}/${endpoint}?${params.toString()}`;

    try {
      const response = await fetch(youtubeUrl);
      const data = await response.json();
      lastData = data;

      if (response.ok) {
        return NextResponse.json(data);
      }

      // クォータ切れなら次のキーへ
      if (response.status === 403 && isQuotaExceeded(data)) {
        continue;
      }

      // その他のエラーはそのまま返す
      return NextResponse.json(data, { status: response.status });
    } catch {
      // ネットワークエラーは次のキーへ
      continue;
    }
  }

  // 全キーがクォータ切れ
  return NextResponse.json(
    lastData ?? { error: 'YouTube APIのクォータ制限に達しました。明日再試行してください。' },
    { status: 429 }
  );
}
