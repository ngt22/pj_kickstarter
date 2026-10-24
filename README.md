# pj_kickstarter

新規プロジェクトの提案資料（14種）を Markdown / YAML で書き、Firestore に流し込んで、ログイン付きのブラウザサイトで閲覧するためのフレームワークです。

## 構成

```
pj_kickstarter/
├─ web/        閲覧サイト（Vite + React + React Router の SPA、Mantine、Firebase Auth、Mermaid）
├─ ingest/     取り込み CLI（Python / uv）：原稿を検証して Firestore に投入
├─ templates/  14種の原稿テンプレート（記入例つき）
├─ projects/   案件ごとの原稿。templates をコピーして記入する
├─ firebase.json / firestore.rules / .firebaserc
```

- 本文はすべてログイン後に Firestore から取得します。HTML に本文は含まれないため、Hosting 上のファイルを直接開かれても内容は漏れません。
- 閲覧できるのは **メール確認済み** のユーザーだけで、さらに次のどちらかに当てはまる場合です（`firestore.rules`）。
  - **管理者**：全案件を閲覧でき、サイトの「閲覧権限」画面（`/admin`）で案件ごとの閲覧者を追加・削除できる
  - **クライアント**：管理者がその案件の閲覧者に指定したメールアドレス
- 原稿の書き込みはクライアント・管理者ともに禁止しています。投入は ingest CLI（Admin SDK）だけが行います。

### Firestore のデータ構造

| パス | 内容 |
| --- | --- |
| `projects/{id}` | `project.yaml` の内容（name, summary, status）と updatedAt |
| `projects/{id}/docs/{type}` | type, title, order, format（markdown / yaml）, body（原文）, updatedAt |
| `access/{email}` | 閲覧権限。projects（閲覧できる案件IDの配列）, updatedAt。ドキュメントIDは小文字のメールアドレス |

閲覧者リストを案件ドキュメントとは別の `access` に持つので、クライアントは自分の権限しか読めず、同じ案件の他の閲覧者のメールアドレスは見えません。

## 権限の管理

管理者は Firebase Auth のカスタムクレーム `admin: true` で判定します。Cloud Functions を使わないため、付け外しは ingest CLI で行います。対象のユーザーは先にサイトでサインアップしておく必要があります。

```sh
cd ingest
uv run kickstarter-ingest admin grant boss@example.com    # 管理者にする
uv run kickstarter-ingest admin revoke boss@example.com   # 管理者から外す
uv run kickstarter-ingest admin list                      # 管理者の一覧
```

付け外しは、そのユーザーが次にログインしたとき（または約1時間後のトークン更新時）に反映されます。

クライアントの閲覧権限は、管理者がサイト右上の「閲覧権限」から案件ごとにメールアドレスで追加・削除します。サインアップ前のメールアドレスも指定でき、そのアドレスでログインした時点で閲覧できるようになります。`project.yaml` の `members` は新規案件を初めて push したときの初期値としてだけ使い、以降の push では閲覧権限を変更しません。

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
nvim projects/my-project/project.yaml   # id を my-project に（members に初期の閲覧者を書いてもよい）
cd ingest
uv run kickstarter-ingest validate ../projects/my-project
uv run kickstarter-ingest push ../projects/my-project      # 本番へ投入
```

本番への投入には、Firebase コンソールで発行したサービスアカウント鍵を `GOOGLE_APPLICATION_CREDENTIALS` に指定してください。鍵はリポジトリに入れないでください。

## ローカルで動かす（エミュレータ）

```sh
# 1. エミュレータ起動（Java 21 以上と pnpm が必要。Ubuntu なら sudo apt install openjdk-21-jre-headless）
cd web && pnpm install
pnpm exec firebase emulators:start --only auth,firestore --project demo-kickstarter

# 2. 別ターミナルでサンプル案件を投入
cd ingest && uv sync
uv run kickstarter-ingest push ../projects/sample --emulator

# 3. 別ターミナルでサイト起動
cd web && VITE_USE_EMULATOR=true pnpm dev
```

ログイン用のユーザーは、エミュレータを起動したまま次のコマンドで作ります（メール確認済みになります）。サンプル案件の閲覧者は `you@example.com` です。`--admin` を付けると管理者として作ります。

```sh
cd web && pnpm emu:user                      # you@example.com / password123
cd web && pnpm emu:user a@example.com pass1234   # 任意のアカウント
cd web && pnpm emu:user boss@example.com password123 --admin   # 管理者
```

Emulator UI（http://localhost:4000 ）の Authentication でも作れます。その場合は Email と Password を実際に入力し、`Verified email?` をオンにしてください。

### リモートのサーバー（headless）で動かす場合

ブラウザはエミュレータ（9099, 8080）と開発サーバー（5173）に直接つなぎます。サーバー側の `localhost` に届くよう、SSH でポートを転送してください。

```sh
ssh -L 4000:localhost:4000 -L 4400:localhost:4400 -L 9099:localhost:9099 \
    -L 8080:localhost:8080 -L 9150:localhost:9150 -L 5173:localhost:5173 user@server
```

## 本番に公開する（Firebase Hosting）

1. Firebase コンソールでプロジェクトを作り、Authentication の「メール/パスワード」と「Google」を有効にする
2. `.firebaserc` の `default` を本番のプロジェクトIDに書き換える
3. `web/.env.example` を `web/.env.local` にコピーし、Firebase の設定値を入れる
4. 公開する
5. 自分のアカウントでサインアップしてから、`uv run kickstarter-ingest admin grant 自分のメール` で管理者にする

```sh
cd web && pnpm build && cd ..
web/node_modules/.bin/firebase deploy --only hosting,firestore:rules
```

すべて無料の Spark プランで動きます（SSR や Cloud Functions は使っていません）。

## テスト

```sh
cd ingest && uv run pytest        # 原稿の検証
cd web && pnpm test                # 表示ロジック
cd web && pnpm test:rules          # Firestore ルール（エミュレータを自動起動）
```
