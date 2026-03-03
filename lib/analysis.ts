import { VideoData, ScoreBreakdown, PostingAnalysis } from '@/types';

/**
 * チャンネルスコアを計算（0〜100点）
 */
export function calculateChannelScore(
  videos: VideoData[],
  subscriberCount: number
): ScoreBreakdown {
  if (videos.length === 0) {
    return { engagement: 0, stability: 0, viral: 0, frequency: 0, trend: 0, total: 0 };
  }

  // 1. エンゲージメント率スコア（30点）
  // 平均 likeCount/viewCount >= 5% で満点
  const videosWithViews = videos.filter((v) => v.viewCount > 0);
  let engagementScore = 0;
  if (videosWithViews.length > 0) {
    const avgLikeRate =
      videosWithViews.reduce((sum, v) => sum + v.likeCount / v.viewCount, 0) /
      videosWithViews.length;
    engagementScore = Math.min(30, (avgLikeRate / 0.05) * 30);
  }

  // 2. 安定性スコア（25点）
  // 最低再生/最高再生の比率
  const viewCounts = videos.map((v) => v.viewCount).filter((v) => v > 0);
  let stabilityScore = 0;
  if (viewCounts.length >= 2) {
    const minViews = Math.min(...viewCounts);
    const maxViews = Math.max(...viewCounts);
    stabilityScore = maxViews > 0 ? (minViews / maxViews) * 25 : 0;
  }

  // 3. 急上昇割合スコア（20点）
  const viralCount = videos.filter((v) => v.isViral).length;
  const viralRate = viralCount / videos.length;
  const viralScore = Math.min(20, viralRate * 100);

  // 4. 投稿頻度スコア（15点）
  // 週2本以上で満点
  let frequencyScore = 0;
  if (videos.length >= 2) {
    const dates = videos.map((v) => new Date(v.publishedAt).getTime());
    const oldestDate = Math.min(...dates);
    const newestDate = Math.max(...dates);
    const weeksDiff = (newestDate - oldestDate) / (7 * 24 * 60 * 60 * 1000);
    if (weeksDiff > 0) {
      const videosPerWeek = videos.length / weeksDiff;
      frequencyScore = Math.min(15, (videosPerWeek / 2) * 15);
    } else {
      // 全動画が同じ週に投稿されている場合
      frequencyScore = 15;
    }
  }

  // 5. 成長トレンドスコア（10点）
  // 直近5本 vs 前5本の再生数比較
  let trendScore = 0;
  if (videos.length >= 10) {
    const sorted = [...videos].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
    const recent5 = sorted.slice(0, 5);
    const prev5 = sorted.slice(5, 10);
    const recentAvg = recent5.reduce((sum, v) => sum + v.viewCount, 0) / 5;
    const prevAvg = prev5.reduce((sum, v) => sum + v.viewCount, 0) / 5;
    if (prevAvg > 0) {
      const trendRatio = recentAvg / prevAvg;
      // 1.0以上なら成長中（最大10点）
      trendScore = Math.min(10, Math.max(0, (trendRatio - 0.5) * 10));
    }
  } else if (videos.length > 0) {
    trendScore = 5; // データ不足の場合は中間値
  }

  // subscriberCountの利用（将来の拡張用、現在は計算に影響しない）
  void subscriberCount;

  const total = Math.round(
    engagementScore + stabilityScore + viralScore + frequencyScore + trendScore
  );

  return {
    engagement: Math.round(engagementScore),
    stability: Math.round(stabilityScore),
    viral: Math.round(viralScore),
    frequency: Math.round(frequencyScore),
    trend: Math.round(trendScore),
    total: Math.min(100, total),
  };
}

/**
 * 投稿時間分析
 */
export function analyzePostingTimes(videos: VideoData[]): PostingAnalysis {
  const byHour = new Array(24).fill(0);
  const byHourCount = new Array(24).fill(0);
  const byDay = new Array(7).fill(0);
  const byDayCount = new Array(7).fill(0);

  videos.forEach((v) => {
    const hour = v.publishHour;
    const day = v.publishDayOfWeek;

    byHour[hour] += v.viewCount;
    byHourCount[hour]++;
    byDay[day] += v.viewCount;
    byDayCount[day]++;
  });

  // 平均を計算
  const avgByHour = byHour.map((total, i) =>
    byHourCount[i] > 0 ? Math.round(total / byHourCount[i]) : 0
  );
  const avgByDay = byDay.map((total, i) =>
    byDayCount[i] > 0 ? Math.round(total / byDayCount[i]) : 0
  );

  const bestHour = avgByHour.indexOf(Math.max(...avgByHour));
  const bestDay = avgByDay.indexOf(Math.max(...avgByDay));

  return {
    byHour: avgByHour,
    byDay: avgByDay,
    bestHour,
    bestDay,
  };
}

const STOP_WORDS = new Set([
  'の', 'に', 'は', 'を', 'が', 'で', 'と', 'た', 'し', 'て', 'も', 'な',
  'い', 'う', 'か', 'や', 'ね', 'よ', 'から', 'まで', 'より', 'など', 'こと',
  'これ', 'それ', 'あの', 'この', 'その', 'あ', 'お', 'へ', 'ば', 'れ', 'せ',
  'さ', 'き', 'く', 'け', 'こ', 'す', 'そ', 'つ', 'ぬ', 'ふ', 'む', 'め',
  'も', 'ら', 'り', 'る', 'わ', 'ん', 'です', 'ます', 'ない', 'ある', 'いる',
  'する', 'なる', 'れる', 'られる', 'させる', 'ました', 'ません', 'です',
  'だ', 'だけ', 'でも', 'けど', 'だが', 'しか', 'ため', 'ところ', 'もの',
  'あり', 'なり', 'ため', 'ほど', 'つつ', 'しも', 'にも', 'とも', 'への',
  'での', 'とは', 'には', 'では', 'から', 'まで', 'より', 'にて',
]);

/**
 * キーワード抽出
 * 上位50%の動画タイトルから単語を抽出してランキングを返す
 */
export function extractKeywords(
  videos: VideoData[],
  topN: number = 20
): { word: string; count: number }[] {
  if (videos.length === 0) return [];

  // 再生数でソートして上位50%を使用
  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);
  const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));

  const wordCount: Map<string, number> = new Map();

  topHalf.forEach((video) => {
    // タイトルから単語を抽出
    const title = video.title
      // 括弧とその中身を除去
      .replace(/【[^】]*】/g, ' ')
      .replace(/「[^」]*」/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      // 記号・数字のみの文字列を除去
      .replace(/[！？!?#＃@＠※・♪♫★☆◆◇▼▽►▶]/g, ' ')
      // 数字のみトークンを除去
      .replace(/\d+/g, ' ');

    // スペース・句読点で分割
    const tokens = title.split(/[\s　、。，．\-_/／・]+/).filter((t) => t.length > 0);

    tokens.forEach((token) => {
      const word = token.trim();
      // 2文字以上、ストップワードでない、数字のみでない
      if (
        word.length >= 2 &&
        !STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) &&
        !/^[a-zA-Z]$/.test(word)
      ) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });
  });

  return Array.from(wordCount.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}
