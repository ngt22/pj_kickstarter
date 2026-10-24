# pj_kickstarter

新規プロジェクトの提案資料（14種）を Markdown / YAML で書き、Firestore に流し込んで、ログイン付きのブラウザサイトで閲覧するためのフレームワークです。

## 構成

```
pj_kickstarter/
├─ web/        閲覧サイト（Vite + React + React Router の SPA、Firebase Auth、Mermaid）
├─ ingest/     取り込み CLI（Python / uv）：原稿を検証して Firestore に投入
├─ templates/  14種の原稿テンプレート（記入例つき）
├─ projects/   案件ごとの原稿。templates をコピーして記入する
├─ firebase.json / firestore.rules / .firebaserc
```

- 本文はすべてログイン後に Firestore から取得します。HTML に本文は含まれないため、Hosting 上のファイルを直接開かれても内容は漏れません。
- 閲覧できるのは、**メール確認済み**かつ `project.yaml` の `members` にメールアドレスがあるユーザーだけです（`firestore.rules`）。
- クライアントからの書き込みはすべて禁止しています。投入は ingest CLI（Admin SDK）だけが行います。

### Firestore のデータ構造

| パス | 内容 |
| --- | --- |
| `projects/{id}` | `project.yaml` の内容（name, summary, status, members）と updatedAt |
| `projects/{id}/docs/{type}` | type, title, order, format（markdown / yaml）, body（原文）, updatedAt |

## ドキュメント14種

| type | ファイル | 表示 |
| --- | --- | --- |
| executive-summary | executive-summary.md | Markdown |
| personas | personas.md | Markdown（ユースケース図は Mermaid） |
| requirements | requirements.md | Markdown |
| tech-spec | tech-spec.md | Markdown |
| screens | screens.md | Markdown（ワイヤーフレームはテキスト図） |
| page-flow | page-flow.md | Mermaid flowchart |
| er-diagram | er-diagram.md | Mermaid erDiagram |
| api | api.yaml | OpenAPI 3 → エンドポイント一覧 |
| roadmap | roadmap.md | Mermaid gantt |
| estimate | estimate.yaml | 表＋合計の自動計算 |
| risks | risks.yaml | 表 |
| test-plan | test-plan.md | Markdown |
| glossary | glossary.yaml | 表（読み順に並べ替え） |
| adr | adr.md | Markdown |

Markdown の原稿には front matter（`title`, `order`）が必要です。不要なドキュメントはファイルを消せば省略されます。

## 新しい案件を追加する

```sh
cp -r templates projects/my-project
nvim projects/my-project/project.yaml   # id を my-project に、members に閲覧者のメールを
cd ingest
uv run kickstarter-ingest validate ../projects/my-project
uv run kickstarter-ingest push ../projects/my-project      # 本番へ投入
```

本番への投入には、Firebase コンソールで発行したサービスアカウント鍵を `GOOGLE_APPLICATION_CREDENTIALS` に指定してください。鍵はリポジトリに入れないでください。

## ローカルで動かす（エミュレータ）

```sh
# 1. エミュレータ起動（Java が必要）
cd web && npm install
npx firebase emulators:start --only auth,firestore --project demo-kickstarter

# 2. 別ターミナルでサンプル案件を投入
cd ingest && uv sync
uv run kickstarter-ingest push ../projects/sample --emulator

# 3. 別ターミナルでサイト起動
cd web && VITE_USE_EMULATOR=true npm run dev
```

ログイン用のユーザーは Emulator UI（http://localhost:4000 ）の Authentication で作り、`Email verified` をオンにしてください。サンプル案件の閲覧者は `you@example.com` です。

## 本番に公開する（Firebase Hosting）

1. Firebase コンソールでプロジェクトを作り、Authentication の「メール/パスワード」と「Google」を有効にする
2. `.firebaserc` の `default` を本番のプロジェクトIDに書き換える
3. `web/.env.example` を `web/.env.local` にコピーし、Firebase の設定値を入れる
4. 公開する

```sh
cd web && npm run build && cd ..
web/node_modules/.bin/firebase deploy --only hosting,firestore:rules
```

すべて無料の Spark プランで動きます（SSR や Cloud Functions は使っていません）。

## テスト

```sh
cd ingest && uv run pytest        # 原稿の検証
cd web && npm test                # 表示ロジック
cd web && npm run test:rules      # Firestore ルール（エミュレータを自動起動）
```
