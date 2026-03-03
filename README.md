# ゆーちぇっく Web版

YouTubeのライバルチャンネルの動画パフォーマンスを分析するWebアプリ。

## 機能

- YouTube Data APIキーをブラウザのlocalStorageに保存（サーバーには送信しない）
- ライバルチャンネルを登録・管理
- ロング/ショート動画を自動分類
- チャンネル内順位・エンゲージメント率を表示
- サムネイル付きで動画一覧を表示

## ローカル起動

```bash
npm install
npm run dev
```

`http://localhost:3000` で起動します。

## デプロイ（Vercel）

```bash
# Vercel CLIをインストール
npm i -g vercel

# デプロイ（初回）
vercel

# 本番デプロイ
vercel --prod
```

または GitHubにpushして Vercel のダッシュボードからリポジトリを連携するだけで自動デプロイされます。

## 使い方

1. 「設定」タブを開く
2. YouTube Data APIキーを入力して保存
3. ライバルチャンネルを追加（チャンネルID or `@ハンドル名`）
4. 「分析」タブに戻り「分析を実行」ボタンをクリック

## ディレクトリ構成

```
yu-check-web/
├── app/
│   ├── layout.tsx        # レイアウト
│   └── page.tsx          # メインページ
├── components/
│   ├── ChannelCard.tsx   # チャンネル別結果カード
│   ├── SettingsPanel.tsx # 設定パネル
│   └── VideoTable.tsx    # 動画テーブル
├── lib/
│   ├── storage.ts        # localStorageユーティリティ
│   └── youtube.ts        # YouTube API呼び出しロジック
└── types/
    └── index.ts          # 型定義
```
