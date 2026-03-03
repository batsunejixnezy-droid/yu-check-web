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
  'する', 'なる', 'れる', 'られる', 'させる', 'ました', 'ません',
  'だ', 'だけ', 'でも', 'けど', 'だが', 'しか', 'ため', 'ところ', 'もの',
  'あり', 'なり', 'ほど', 'つつ', 'しも', 'にも', 'とも', 'への',
  'での', 'とは', 'には', 'では', 'にて', 'まし', 'てい', 'てる',
  'した', 'して', 'しな', 'しま', 'ので', 'のに', 'から', 'まで',
  'より', 'など', 'まま', 'ほか', 'うち', 'ごと', 'について', 'において',
  'という', 'といえば', 'みたい', 'らしい', 'ような', 'かな', 'かも',
  'じゃ', 'っていう', 'って', 'かって', 'なって', 'してみた', 'してみる',
  'やって', 'やってみ', 'みた', 'みて', 'みる',
  'part', 'Part', 'PART', 'vol', 'Vol', 'VOL', 'ver', 'Ver', 'VER',
  'new', 'New', 'NEW', 'the', 'The', 'THE', 'and', 'for', 'with',
]);

/**
 * キーワード抽出
 * カタカナ・漢字・英語パターンで意味ある短いワードを抽出してスコアリング
 */
export function extractKeywords(
  videos: VideoData[],
  topN: number = 20
): { word: string; count: number }[] {
  if (videos.length === 0) return [];

  // 再生数でソートして上位50%を使用
  const sorted = [...videos].sort((a, b) => b.viewCount - a.viewCount);
  const topHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const globalAvg = topHalf.reduce((s, v) => s + v.viewCount, 0) / topHalf.length || 1;

  // word → そのワードを含む動画の再生数リスト
  const wordVideos: Map<string, number[]> = new Map();

  topHalf.forEach((video) => {
    const cleaned = video.title
      .replace(/【[^】]*】/g, ' ')
      .replace(/「[^」]*」/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[！？!?#＃@＠※・♪♫★☆◆◇▼▽►▶〜～]/g, ' ')
      .replace(/\d+/g, ' ');

    const words: string[] = [];

    // カタカナ連続（2〜8文字）— 外来語・固有名詞
    const katakana = cleaned.match(/[ァ-ヶーｦ-ﾟ]{2,8}/g) || [];
    words.push(...katakana);

    // 漢字連続（2〜6文字）— 熟語・名詞
    const kanji = cleaned.match(/[一-龯々〆]{2,6}/g) || [];
    words.push(...kanji);

    // 英字単語（3〜8文字）— ブランド・技術用語
    const english = cleaned.match(/[A-Za-z]{3,8}/g) || [];
    words.push(...english);

    // ひらがな+漢字 or 漢字+ひらがな の複合（2〜6文字）
    const mixed = cleaned.match(/[ぁ-ん一-龯]{2,6}/g) || [];
    words.push(...mixed);

    // 同一動画内での重複除去
    const seen = new Set<string>();
    words.forEach((w) => {
      const word = w.trim();
      if (
        word.length >= 2 &&
        word.length <= 8 &&
        !STOP_WORDS.has(word) &&
        !/^\d+$/.test(word) &&
        !seen.has(word)
      ) {
        seen.add(word);
        const existing = wordVideos.get(word) || [];
        existing.push(video.viewCount);
        wordVideos.set(word, existing);
      }
    });
  });

  // スコア = 出現回数 × (そのワードを含む動画の平均再生数 / 全体平均)
  // 2回以上出現したワードのみ対象
  return Array.from(wordVideos.entries())
    .filter(([, viewCounts]) => viewCounts.length >= 2)
    .map(([word, viewCounts]) => {
      const count = viewCounts.length;
      const avgViews = viewCounts.reduce((s, v) => s + v, 0) / count;
      const score = count * (avgViews / globalAvg);
      return { word, count, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ word, count }) => ({ word, count }));
}
