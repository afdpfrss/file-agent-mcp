# file-agent-mcp 依存ライブラリ調査メモ

このメモは MVP 着手前のライブラリ選定レビュー用。各カテゴリで「採用候補」「却下案」「決め手」「未確認の懸念」を並べる。とくに PDF パーサは差が大きいので最後にまとめて比較する。

レビュー観点：
- ESM / Node 22+ 対応（プロジェクトは ESM, Node >= 22 を前提とする）
- 純 Node で完結すること（ripgrep などの外部バイナリは禁止方針）
- メンテ状況（最終リリース、open issue 数、メジャー破壊変更のリズム）
- 必要メタの取得しやすさ（PDF=ページ、XLSX=シート+セル、DOCX=段落番号）
- ライセンス（MIT / Apache-2.0 / BSD を許容）

---

## 1. MCP サーバ SDK

| 候補 | 採否 | 理由 |
|---|---|---|
| `@modelcontextprotocol/sdk` | **採用** | 公式。stdio トランスポート同梱。指示書通り。 |

未確認の懸念：なし。md-agent-mcp で使用実績あり。

---

## 2. SQLite

| 候補 | 採否 | 理由 |
|---|---|---|
| **`better-sqlite3`** | **採用** | 同期 API で記述が単純化、FTS5 込み、prepared statement キャッシュで爆速。指示書通り。pre-built binary が major platform で配布されている。 |
| `node:sqlite`（Node 標準） | 不採用 | Node 22.5+ で experimental。バンドルされる SQLite ビルドに **trigram トークナイザが含まれる保証がない**（`SQLITE_ENABLE_FTS5` は有効化されているが trigram は別フラグ）。MVP 段階で API stability も心許ない。v0.x のうちは外部依存で確実性を取る。 |
| `sqlite3`（node-sqlite3） | 不採用 | 非同期コールバック API、FTS5 操作で記述が冗長。 |
| `wa-sqlite` / `sql.js` | 不採用 | WASM。永続化に自前 I/O が必要で、純粋に遅い。 |

### `better-sqlite3` 採用にあたっての確認事項

- **FTS5 + trigram トークナイザの同梱**：upstream `better-sqlite3` がバンドルする SQLite には `SQLITE_ENABLE_FTS5` と trigram が両方有効化されている（公式の compile-time options を確認する必要あり。`SELECT sqlite_compileoption_used('SQLITE_ENABLE_FTS5')` と `PRAGMA compile_options` を起動時に走らせて assert する）。
- **Node 22 / 24 のネイティブビルド**：`better-sqlite3` は prebuild-install で各 Node メジャーバージョンの prebuild を提供。CI で Node 22 / 24 マトリクスを通せれば実用上問題なし。Node の N-API ABI 互換のため、新しい Node が出てもしばらくは再ビルド不要。
- **失敗時のフォールバック**：prebuild が無い環境では `node-gyp` ローカルビルドにフォールバックする。CI の install ステップで `python3` と build-essential を要求するか、`npm config set build-from-source false` で prebuild only にするか方針を決める。

---

## 3. Markdown

| 候補 | 採否 | 理由 |
|---|---|---|
| **自前実装**（fs.readFile → 改行で split） | **採用** | 検索本文化には plain text さえあればよい。ヘッダ・コードフェンス除去も MVP では不要（FTS5 のスニペットが文脈付き抽出をしてくれる）。指示書通り。 |
| `remark` / `markdown-it` | 不採用 | AST まで作る必要がない。将来「コードブロックは別チャンクにする」「フロントマターを除外する」拡張を入れる際に検討。 |

実装メモ：BOM 除去、CRLF → LF 正規化、行番号は 1-indexed。空行スキップはせず行番号を保つ。

---

## 4. DOCX

| 候補 | 採否 | 理由 |
|---|---|---|
| **`mammoth`** | **採用候補** | 業界標準、メンテ継続中。`convertToHtml` で段落構造を保ったまま HTML として取り出せる → `<p>` 単位でチャンク化し `paragraph` index を付与できる。`extractRawText` だと段落番号が失われるので NG。 |
| `docx4js` | 不採用 | メンテ停止気味、API 不安定。 |
| `node-docx` / `docx-parser` | 不採用 | 同上、もしくは作成専用。 |
| 自前 zip + xml 解析 | 不採用 | DOCX は ZIP の中の word/document.xml だが、段落ノード（`w:p`）の textRun を結合するロジックを自前で書くコストに見合わない。 |

### mammoth 利用時の注意

- `convertToHtml` の結果は `<p>...</p><p>...</p>` の連結なので、段落 index は出現順で付与。
- ハイパーリンク・強調などのインラインタグは `text` フィールドではプレーン化する。
- 画像は MVP では捨てる（将来 OCR extractor で別チャンクとして拾う）。
- テーブルは `<table>` として出る。MVP では行ごとに 1 チャンクで十分。

---

## 5. XLSX

| 候補 | 採否 | 理由 |
|---|---|---|
| **`exceljs`** | **採用候補** | `worksheet.eachRow` → `row.eachCell` で行/列番号とセル値を素直に取れる。シート名・セルアドレス（"A1"）が `cell.address` で直接得られる。MIT、メンテ継続。 |
| `xlsx` (SheetJS Community) | 次点 | 機能は最強だが、コミュニティ版の配布チャネル（npm 上のバージョン）が古いまま放置されがち。`sheet[address]` でセル値が取れるので実装は可能だが、API が低レベル寄り。 |
| `xlsx-populate` | 不採用 | メンテ停滞。 |
| `node-xlsx` | 不採用 | 行列の配列しか返さず、セルアドレス取得が面倒。 |

### exceljs 利用時の注意

- 1 セル = 1 チャンクにすると行数の多いシートで爆発する。**戦略 A**：行を 1 チャンクとし、location は `{ sheet, cell: "A<rowNumber>" }`（行頭セル）にする。**戦略 B**：非空セルだけ 1 セル 1 チャンク。  
  → MVP は **戦略 A（行単位）** を採用。スニペットで列値の連結を返す。セル単位の精度が必要ならクエリ側で `Ctrl-F` 相当の絞り込みを行えばよく、index 爆発を避けたほうが現実的。
- 数式セルは `cell.value` がオブジェクトになる場合がある（`{ formula, result }`）。`result` を優先して text 化する。
- 日付セルは Date オブジェクト。ISO 文字列に正規化して索引化。
- 巨大ファイル対策として `readFile` ではなく `stream` API（`exceljs.stream.xlsx.WorkbookReader`）も検討。MVP は普通の `readFile` で start、メモリ問題が出たら streaming へ。

---

## 6. PDF（最重要）

PDF は MVP の品質を左右する。候補を 4 つ並べる。

| 候補 | バージョン感 | ESM | ページ単位抽出 | パフォーマンス | 採否 |
|---|---|---|---|---|---|
| **`pdfjs-dist`**（Mozilla 公式） | 4.x / 5.x | ESM 化済み（`pdfjs-dist/legacy/build/pdf.mjs`） | ◎（`page.getTextContent()`） | 中（純 JS、warm 後は速い） | **採用候補 A** |
| **`unpdf`** | 1.x | ESM-first | ◎（pdfjs-dist の serverless build をラップ） | 中（pdfjs ベース） | **採用候補 B（推奨）** |
| `pdf-parse` | 1.x（メンテ停滞） | CJS 中心 | △（`pagerender` コールバックで自力分割） | 中 | 不採用 |
| `pdf2json` | 3.x | CJS | ◎（JSON ツリー） | 遅め、出力が冗長 | 不採用 |
| `mupdf` (artifex/mupdf-js) | - | - | ◎ | 速い（ネイティブ） | 不採用（ネイティブ依存を増やしたくない、ライセンス AGPL） |

### 個別評価

**`pdfjs-dist`**
- メリット：本家 Mozilla、最も信頼できる仕様準拠。ページ単位イテレーション・テキストアイテムごとの座標まで取れる。
- デメリット：API が SPA 想定なので Node からは `legacy/build/pdf.mjs` を import する必要があり、worker 起動の作法が独特。バンドルサイズが大きい（インストール容量 ~10MB）。フォント未埋め込み PDF で warning を吐く。
- メモリ：1 ページずつ `page.getTextContent()` → `page.cleanup()` で解放する pattern を踏めば実用範囲。

**`unpdf`**
- メリット：Node / serverless 専用に pdfjs-dist を再パッケージしたもの。worker 設定不要、ESM-first、API がシンプル（`extractText(pdf, { mergePages: false })` でページ配列を返す）。依存サイズも軽い。
- デメリット：薄いラッパーゆえ pdfjs の機能を全部はそのまま使えない（バウンディングボックスなど低レベル API は pdfjs 直叩きが必要になる）。MVP の用途（ページごとのテキスト抽出）には完全に十分。
- メンテ：unjs 系列で active。

**`pdf-parse`**
- 旧来の定番だが、最新 Node でビルド警告が出るとの報告あり、`pagerender` コールバックで自力分割する必要があり API が古い。新規採用する理由がない。

**`pdf2json`**
- JSON 出力は強力だが、テキスト抽出の単純用途には過剰。出力サイズが膨大でメモリも食う。

### 推奨

**第一候補は `unpdf`、第二候補は `pdfjs-dist` 直接**。

理由：
- MVP の要件は「ページごとのテキスト」だけ。unpdf のシグネチャがその一点に最適化されている。
- worker 設定や `legacy/` パスの選択など pdfjs-dist 直叩きの落とし穴を回避できる。
- 将来「テキストの座標で snippet を強化したい」「画像レイヤを別 extractor に渡したい」要件が出たら pdfjs-dist 直叩きに切り替える、という昇格パスが自然（unpdf も内部で pdfjs を使っているので知見は流用できる）。

**未確認の懸念**：
- 暗号化 PDF・スキャン PDF（画像のみ）・破損 PDF の挙動 → 起動時にカテゴリ別の小サンプルでスモークテストする。スキャン PDF は MVP では「テキスト 0 件」で OK、v0.2 で OCR extractor が拾う。
- 大規模 PDF（数百ページ）のメモリ消費 → 1 ページ抽出ごとに `await new Promise(setImmediate)` を挟む等の作法を追加するか検討。
- 日本語 CJK フォントの抽出精度 → unpdf / pdfjs 共に CMap 同梱の有無で挙動が変わる。Node 側で CMap データを読み込ませる設定（`useSystemFonts: false`, `cMapUrl` 指定）が必要かを実機検証。

---

## 7. ファイル監視

| 候補 | 採否 | 理由 |
|---|---|---|
| **`chokidar`** | **採用** | 指示書通り。クロスプラットフォーム、依存も成熟。v4 系は `glob` 依存を切り、軽量化された。 |
| `fs.watch` / `fs.promises.watch` | 不採用 | プラットフォーム差が大きい。再帰監視は Node 22 でも安定とは言いがたい。 |
| `parcel-watcher` | 不採用 | ネイティブ依存追加。chokidar で十分速い。 |

---

## 8. 入力検証

| 候補 | 採否 | 理由 |
|---|---|---|
| **`zod`** | **採用** | MCP SDK のツール定義と相性良し（JSON Schema 化のためのアダプタが多い）。指示書通り。 |

---

## 9. CLI 引数パース

| 候補 | 採否 | 理由 |
|---|---|---|
| **Node 標準 `node:util` の `parseArgs`** | **採用** | Node 22 で安定。`--include` のような repeatable も `multiple: true` で表現できる。依存ゼロ。 |
| `commander` / `yargs` | 不採用 | 過剰。CLI は数フラグしかない。 |

---

## 10. テスト

| 候補 | 採否 | 理由 |
|---|---|---|
| **`node:test` + `tsx --test`** | **採用** | 指示書通り。dependency ゼロ、Node 22 で十分高速。 |
| `vitest` | 不採用 | 機能は良いが ESM/TS 周りでセットアップコストが追加で発生。MVP 段階では node:test で十分。 |

---

## 11. ロガー

| 候補 | 採否 | 理由 |
|---|---|---|
| **`console.error` 直叩き**（stderr のみ） | **採用** | stdio MCP では stdout は frame 専用。stderr に plaintext を吐くだけで MVP は事足りる。 |
| `pino` | 不採用 | structured log の必要性が出てから検討。 |

---

## まとめ：採用ライブラリ一覧

| カテゴリ | ライブラリ | バージョン目安 |
|---|---|---|
| MCP | `@modelcontextprotocol/sdk` | ^1.x |
| DB | `better-sqlite3` | ^11.x |
| ファイル監視 | `chokidar` | ^4.x |
| 入力検証 | `zod` | ^3.x |
| DOCX | `mammoth` | ^1.x |
| XLSX | `exceljs` | ^4.x |
| PDF | **`unpdf`**（第一候補） / `pdfjs-dist`（第二候補） | unpdf ^1.x |
| Markdown | 自前 | - |
| CLI parse | `node:util` 標準 | - |
| Test | `node:test` + `tsx` | tsx ^4.x |

開発依存：`typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`。

---

## レビュアー（人間）に判断を仰ぎたいポイント

1. **PDF パーサ**：`unpdf` 採用案で進めてよいか？ 「pdfjs-dist 直叩きで始めたい」「実機検証してから決めたい」など意見があれば。
2. **XLSX のチャンク粒度**：行単位（戦略 A）で確定してよいか？ セル単位（戦略 B）の方が「A1 にヒット」のような精度が出るが、空白セル除外しても列の多い表でチャンク数が膨れる。
3. **better-sqlite3 の Windows サポート**：CI に Windows を含めるか？ MVP は Linux / macOS だけで十分か？
4. **DB の置き場所**：`<root>/.file-agent-mcp/index.db` で確定でよいか？ `.gitignore` 推奨を README に書く前提。
5. **MVP のスコープ確認**：本メモで「不採用」とした候補のうち、再検討すべきものはあるか？

このメモが OK が出たら、次は `package.json` / `tsconfig.json` / 最小スケルトン（`src/index.ts` + `src/server.ts`）の起草に進みます。
