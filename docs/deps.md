# 依存ライブラリ調査メモ（MVP 着手前レビュー用）

このメモは `file-agent-mcp` MVP 実装着手前の依存ライブラリ選定のための比較メモです。**人間レビュー前提**で、最終決定は本ドキュメントへのフィードバックを受けた上で `package.json` に固定します。

対象 MVP スコープ：ローカルフォルダ配下の MD / DOCX / XLSX / PDF を SQLite FTS5 で全文検索する MCP サーバ。

---

## 1. ランタイム / 言語 / ビルド

| 項目 | 候補 | 採用案 | 根拠 |
|---|---|---|---|
| Node ランタイム | 22 / 24 | **>= 22** | 姉妹 `md-agent-mcp` と揃える。Node 22 で `--experimental-strip-types` 等は使わず、`tsc` で純粋に compile（後述）。 |
| 言語 | TS (ESM) / TS (CJS) / 純 JS | **TypeScript ESM** | MCP SDK が ESM 前提、エコシステムの趨勢に追随。 |
| ビルド | `tsc` / `tsx`（実行時）/ `tsup`/`esbuild` | **`tsc` で出力、`tsx` は dev/test のみ** | ネイティブ依存（`better-sqlite3`）を含むので bundler でまとめる旨味は薄い。CJS interop は ESM + `"type": "module"` で割り切る。 |
| Lint | `eslint` + `@typescript-eslint` / `biome` | **`biome`** | 速い・設定軽い・format も兼ねる。MVP の小規模スコープに最適。 |
| テスト | `vitest` / `node:test` + `tsx` | **`node:test` + `tsx --test`**（キックオフ文書の指定どおり） | 依存を増やさない。Node 22 の `node:test` は十分成熟。 |

懸念：`biome` を採用する場合、CI で MSDocs 系 plugin 不要のシンプル運用にする。エディタ統合は VS Code 拡張で十分。

---

## 2. MCP

| 候補 | 採用 | コメント |
|---|---|---|
| `@modelcontextprotocol/sdk` | **採用** | 公式 SDK。stdio トランスポート、`Server` / `setRequestHandler` を使う。 |
| 自前 JSON-RPC 実装 | 不採用 | スコープ外。SDK のメンテに乗る方が安全。 |

---

## 3. SQLite

| 候補 | 長所 | 短所 | 採否 |
|---|---|---|---|
| **`better-sqlite3`** | 同期 API、FTS5 同梱、抜群に速い、ネイティブビルド済バイナリが大半の OS で配布される | ネイティブビルド（CI で `node-gyp` 経路、libstdc++ 依存）。ESM からの import は `import Database from 'better-sqlite3'` で OK | **採用** |
| `node:sqlite`（Node 22+ 同梱） | 依存ゼロ | API がまだ若く FTS5 周りの実績薄。stable 入りは Node 24 系。トークナイザ `trigram` 利用可能性の検証必要 | 不採用（v0.2 で再検討） |
| `sql.js` (WASM) | クロスプラットフォーム楽 | パフォーマンスが劣る・大規模 corpus で詰まる | 不採用 |
| `libsql` / `@libsql/client` | リモート同期等の将来性 | リモート機能は MVP では不要 | 不採用 |

採用：**`better-sqlite3`**。CI で Node 22/24 の prebuilt が落ちてくるか確認すること（過去事例として Node メジャーアップ直後は遅延あり）。`node-pre-gyp-github` の事情は確認済みの前提。

### FTS5 トークナイザ

- `tokenize='trigram'`（キックオフ指定通り）を採用。
- 日本語にはトリグラム（3文字 n-gram）が最も実用的。bigram は誤ヒットが多い。`unicode61` 単体は CJK にほぼ無力。
- 補助として `remove_diacritics` は trigram では効かない（Unicode 正規化が必要）。NFKC 正規化を取り込み時に行う方針。

---

## 4. ファイル監視

| 候補 | 採否 | コメント |
|---|---|---|
| **`chokidar` v4** | **採用** | v4 で依存を大幅削減、glob は `picomatch` 統合済み。MVP の `--no-watch` でも雛形は入れておく |
| `node:fs.watch` | 不採用 | macOS / Linux 差異の吸収が辛い |
| `parcel-watcher` | 不採用候補 | パフォーマンスは魅力だが MVP オーバースペック |

---

## 5. 入力検証 / CLI

| 用途 | 候補 | 採用 |
|---|---|---|
| Schema | **`zod`** v3 系 | キックオフ指定どおり。MCP tool 入出力の検証で活躍 |
| CLI 引数 | `commander` / `yargs` / 手書き / **`citty`** | **`commander`** を採用。MVP の引数は薄いので軽量・型が乗る・実績で選ぶ。手書きはオプション増加で破綻しがち |
| globs | **`picomatch`**（chokidar に同梱）/ `micromatch` | chokidar 経由で `picomatch` を使う |

---

## 6. 抽出器（Extractor）— ★最重要

### 6.1 Markdown

- 自前で plain text 化する（CommonMark を入れる必要なし）。
- 単純な「行単位スプリット → 各行を chunk」で MVP は十分。
- フロントマター（YAML）は除外（`---` で囲まれた先頭ブロックをスキップ）。
- 採用：**標準 `node:fs/promises` + 自前パース**。

### 6.2 DOCX

| 候補 | 長所 | 短所 |
|---|---|---|
| **`mammoth`** | HTML / plain text 抽出が安定、メンテも継続 | 段落以下の細かい位置情報は取りにくい（段落 index 単位） |
| `docx4js` / `docx` | 編集寄り | 抽出特化ではない |
| `officeparser` | 多形式統合（DOCX/XLSX/PDF を一括） | ブラックボックス度が高くロケータ情報が落ちる |

採用：**`mammoth`**。`extractRawText` で本文取得 → 段落単位で split。`ChunkLocation` は `{ kind: "docx", paragraph: number }` を 1 始まりで採番。

### 6.3 XLSX

| 候補 | 長所 | 短所 |
|---|---|---|
| **`exceljs`** | TypeScript 型、シート / セル座標 (`A1`) を素直に保持、メンテ良好 | やや重い・大ファイルでメモリ食う |
| `xlsx`（SheetJS CE） | 高速、軽量 | ライセンスは Apache-2.0 で OK だが、最新版は npm の流通が変則的（GitHub 直 install を案内する時期あり） |
| `node-xlsx` | 薄い wrapper | 機能不足 |

採用：**`exceljs`**。シート名 + セルアドレス (`A1`) をそのまま `ChunkLocation` に積める。1 セル = 1 chunk を基本（空セルは捨てる）。マージセルは左上のみ取り、結合範囲をメタに残す（v0.2 で考慮）。

### 6.4 PDF — ★差が出やすい

| 候補 | 長所 | 短所 | 評価 |
|---|---|---|---|
| **`pdfjs-dist`** | Mozilla 公式、ページ単位 API (`getPage(n).getTextContent()`) が綺麗、活発メンテ、純 JS | バンドルサイズ大、worker 設定がやや煩雑、ESM 周りで version 跨ぎの罠あり（v4 系で legacy build を使うのが安定） | ◎ |
| `pdf-parse` | 簡単（`pdf-parse(buffer)` 一発） | ページ境界が壊れがち（全テキスト連結、ページマーカに依存）、メンテ停止気味、CJK でレイアウト崩れ報告多数 | △ |
| `unpdf` | `pdfjs-dist` の serverless 向け薄ラッパ、Node でも使える | 結局 `pdfjs-dist` 依存。Node 環境では直接 pdfjs を呼ぶ方が制御しやすい | ○（候補） |
| `pdf2json` | ページ・座標まで取れる | レイアウト依存・絶対座標ベースで「読み順」が乱れがち | × |
| `mupdf-js` (WASM) | レンダ品質高 | サイズ大・MVP オーバースペック | × |

**採用：`pdfjs-dist`（v4 legacy build）**。理由：
1. ページ単位抽出が `ChunkLocation.kind === "pdf"` のロケータと自然に対応。
2. 純 JS なので CI のビルド負担なし（`better-sqlite3` だけで十分）。
3. CJK の `getTextContent()` は item の `str` が文字単位で来るため、連結時に空白挿入ロジックを書く必要あり（worker は無効化、`disableWorker: true` 相当の使い方）。
4. `pdfjs-dist/legacy/build/pdf.mjs` を import するのが Node ESM で最も無難。

懸念点：
- PDF が画像スキャンのみの場合は本文抽出ゼロ。MVP では「テキスト 0 件 → kind は登録するが chunks は空」を許容。OCR は v0.2 で extractor 追加。
- 暗号化 PDF / 壊れた PDF はエラーログを stderr に出して個別スキップ。インデックス全体は止めない。

---

## 7. パス / ファイルユーティリティ

| 用途 | 採用 |
|---|---|
| Path traversal ガード | 自前（`path.resolve` 後に `root` 配下かチェック） |
| Hidden / 無視ディレクトリ | デフォルト除外：`.git`, `node_modules`, `.file-agent-mcp`, `.DS_Store`。`--exclude` で追加可能 |
| ファイル種別判定 | 拡張子ベース（MVP）。MIME は将来必要なら `mime-types` を追加 |

---

## 8. CI / リリース

- GitHub Actions、Node 22 / 24 マトリクス。
- `better-sqlite3` の prebuilt が Node 24 で落ちてこない場合に備え、`actions/setup-node` + `npm ci` に加え build キャッシュ（`~/.npm`, `~/.cache/node-gyp`）を効かせる。
- リリースは MVP 段階では手動 `npm publish` （`bin: file-agent-mcp`）。changesets は v0.2 以降。

---

## 9. ライセンス確認（採用候補のみ）

| パッケージ | ライセンス | 備考 |
|---|---|---|
| `@modelcontextprotocol/sdk` | MIT | OK |
| `better-sqlite3` | MIT | OK |
| `chokidar` | MIT | OK |
| `zod` | MIT | OK |
| `commander` | MIT | OK |
| `mammoth` | BSD-2-Clause | OK |
| `exceljs` | MIT | OK |
| `pdfjs-dist` | Apache-2.0 | OK |
| `biome` (`@biomejs/biome`) | MIT \| Apache-2.0 | OK |

すべて緩いライセンスで配布物 (`npm` パッケージ) に問題なし。

---

## 10. 確定提案サマリ（人間レビュー対象）

```jsonc
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.x",     // 最新 stable を実装時に固定
    "better-sqlite3": "^11.x",
    "chokidar": "^4.x",
    "commander": "^12.x",
    "exceljs": "^4.x",
    "mammoth": "^1.x",
    "pdfjs-dist": "^4.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.x",
    "@types/better-sqlite3": "^7.x",
    "@types/node": "^22.x",
    "tsx": "^4.x",
    "typescript": "^5.x"
  },
  "engines": { "node": ">=22" }
}
```

### レビュアに尋ねたい点

1. **PDF：`pdfjs-dist` で確定して良いか？** `pdf-parse` の手軽さは魅力だが、ページ境界の信頼性で `pdfjs-dist` を強く推奨。
2. **Lint：`biome` で良いか？** `eslint` + `prettier` の方が好みなら差し戻し可。
3. **CLI：`commander` で良いか？** 手書き or `citty` への変更余地あり。
4. **`mammoth` のロケータ粒度（段落単位）で良いか？** より細かく取りたい場合は OOXML 直パース（`fast-xml-parser` 等）への切り替え検討余地あり。MVP は段落で十分の想定。
5. **`node:sqlite` の検証**は v0.2 で良いか？（MVP では `better-sqlite3` で割り切る）

---

## 11. 実装着手の前提となる next step

このメモへのレビューが返ってきたら、

1. `npm init` + `tsconfig.json` + Biome 設定
2. `package.json` の `bin`, `engines`, `type: "module"` を確定
3. `src/index/schema.sql` と `db.ts` 雛形
4. Markdown extractor で end-to-end（CLI → 起動 → 検索）を通す

の順で着手します。
