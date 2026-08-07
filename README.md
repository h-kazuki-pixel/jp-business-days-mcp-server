# jp-business-days MCP Server 📅✅

[![CI](https://github.com/h-kazuki-pixel/jp-business-days-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/h-kazuki-pixel/jp-business-days-mcp-server/actions/workflows/ci.yml)

日本の営業日計算(土日・祝日を除く)を Claude に提供する MCP (Model Context Protocol) サーバーです。

An MCP server that gives Claude accurate Japanese business-day calculations (weekends and national holidays excluded). Works fully offline — no API keys required.

jp-series の第2弾です。第1弾の [jp-dates-mcp-server](https://github.com/h-kazuki-pixel/jp-dates-mcp-server)(祝日・和暦)と組み合わせて使うと、より便利になります。

## ✨ できること / Features

Claude にこんな質問が正確に即答できるようになります:

- 「今日は営業日?」
- 「今日から5営業日後は何日?」
- 「今月と来月の間で、営業日は何日ある?」
- 「9月30日が期限の書類、10営業日前までに準備するなら、いつまでに動けばいい?」

| ツール | 説明 |
|---|---|
| `jp_is_business_day` | 指定日が営業日(平日かつ祝日でない)かどうかを判定 |
| `jp_add_business_days` | 指定日からN営業日後・前の日付を計算 |
| `jp_business_days_between` | 2つの日付の間(両端含む)の営業日数をカウント |
| `jp_calc_deadline` | 基準日(有効期限・締切日など)からN営業日前の「対応期限日」を逆算 |

- ✅ **APIキー不要・完全オフライン**(祝日はアルゴリズムで算出)
- ✅ 振替休日・国民の休日・2020/2021年の五輪特例に対応
- ✅ 対応範囲: 2020〜2099年

### 💡 `jp_calc_deadline` の使いどころ

許認可の更新、契約の更新、各種届出など、「期限のX営業日前までに提出・対応する」という管理が必要な場面で使えます。土日・祝日を挟んでも、実際に動ける営業日ベースで正確に逆算します。

## 🚀 セットアップ / Setup

### 1. インストール

```bash
git clone https://github.com/h-kazuki-pixel/jp-business-days-mcp-server.git
cd jp-business-days-mcp-server
npm install
npm run build
```

### 2. Claude Desktop に登録

`claude_desktop_config.json` に以下を追加します。

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jp-business-days": {
      "command": "node",
      "args": ["/absolute/path/to/jp-business-days-mcp-server/dist/index.js"]
    }
  }
}
```

Claude Desktop を再起動すると、🔌アイコンからツールが確認できます。

### 3. 使ってみる

Claude にそのまま話しかけるだけです:

> 「今日から10営業日後はいつ?」
> 「8月31日が期限なら、10営業日前はいつまでに動けばいい?」

## 🧪 動作確認 / Testing

MCP Inspector で対話的にテストできます:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

リポジトリ同梱の統合テスト(4つのツールをすべて実行して検証)も実行できます:

```bash
npm run build
node test/run_tests.mjs
```

## 📝 営業日計算について / Notes

- 祝日は法律(国民の祝日に関する法律)のルールに基づきアルゴリズムで算出しています(jp-dates-mcp-serverと同じロジック)
- 「営業日」は「祝日でない平日(月〜金)」として計算しています。会社独自の休業日(夏季休業・年末年始休業など)は含まれません
- 将来の法改正には追従が必要です。誤りを見つけたら Issue で教えてください!

## 🤝 コントリビュート / Contributing

Issue・Pull Request 歓迎です!

## 📄 License

MIT
