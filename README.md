# pj_kickstarter

新規プロジェクトの提案資料（14種）を Markdown / YAML で書き、Firestore に流し込んで、ログイン付きのブラウザサイトで閲覧するためのフレームワークです。

## 構成

```
pj_kickstarter/
├─ web/        閲覧サイト（Vite + React + React Router の SPA、Mantine、Firebase Auth、Mermaid、React Flow）
├─ ingest/     取り込み CLI（Python / uv）：原稿を検証して Firestore に投入
├─ templates/  14種の原稿テンプレート（記入例つき）。実体は ingest/src/kickstarter_ingest/templates（CLI に同梱）
├─ projects/   案件ごとの原稿。`kickstarter-ingest init` で templates から作って記入する
├─ firebase.json / firestore.rules / .firebaserc
```

- 本文はすべてログイン後に Firestore から取得します。HTML に本文は含まれないため、Hosting 上のファイルを直接開かれても内容は漏れません。
- 閲覧できるのは **メール確認済み** のユーザーだけで、さらに次のどちらかに当てはまる場合です（`firestore.rules`）。
  - **管理者**：全案件を閲覧でき、サイトの「案件の管理」画面（`/admin`）で案件ごとの閲覧者を追加・削除し、案件を作成・削除できる
  - **クライアント**：管理者がその案件の閲覧者に指定したメールアドレス
- 原稿を書き込めるのは管理者だけです。ingest CLI が、管理者のログイン（`login`）か Admin SDK（サービスアカウント鍵・エミュレータ）で書き込みます。クライアントは書き込めません。

### Firestore のデータ構造

| パス | 内容 |
| --- | --- |
| `projects/{id}` | `project.yaml` の内容（name, summary, status）と updatedAt |
| `projects/{id}/docs/{type}` | type, title, order, format（markdown / yaml）, body（原文）, updatedAt |
| `projects/{id}/annotations/{autoId}` | 付箋。docType（表紙は `_cover`）, authorUid / authorName / authorEmail, items（ペン・囲み・引出線）, comment, tags, status（open / close）, anchor（目印の要素と位置）, width, createdAt, updatedAt |
| `access/{email}` | 閲覧権限。projects（閲覧できる案件IDの配列）, updatedAt。ドキュメントIDは小文字のメールアドレス |
| `settings/site` | 表紙に出す提案者。vendor_name（自社名）, contact（担当者）, updatedAt。ログインした人なら読める |
| `settings/private` | push 時の禁止語。forbidden_terms, updatedAt。管理者だけが読み書きできる |

閲覧者リストを案件ドキュメントとは別の `access` に持つので、クライアントは自分の権限しか読めず、同じ案件の他の閲覧者のメールアドレスは見えません。

## 権限の管理

管理者は Firebase Auth のカスタムクレーム `admin: true` で判定します。Cloud Functions を使わないため、付け外しは ingest CLI で行います。対象のユーザーは先にサイトでサインアップしておく必要があります。

```sh
cd ingest
uv run kickstarter-ingest admin grant boss@example.com --gcp-project 本番のID    # 管理者にする
uv run kickstarter-ingest admin revoke boss@example.com --gcp-project 本番のID   # 管理者から外す
uv run kickstarter-ingest admin list --gcp-project 本番のID                      # 管理者の一覧
```

ローカルのエミュレータに対しては `--gcp-project` の代わりに `--emulator` を付けます。どちらも付けないとエラーになります（gcloud の既定プロジェクトなど、無関係なプロジェクトにうっかり接続しないため）。

```sh
uv run kickstarter-ingest admin grant boss@example.com --emulator
```

付け外しは、そのユーザーが次にログインしたとき（または約1時間後のトークン更新時）に反映されます。

クライアントの閲覧権限は、管理者がサイト右上の「案件の管理」から案件ごとにメールアドレスで追加・削除します。サインアップ前のメールアドレスも指定でき、そのアドレスでログインした時点で閲覧できるようになります。`project.yaml` の `members` は新規案件を初めて push したときの初期値としてだけ使い、以降の push では閲覧権限を変更しません。

新しい案件は「案件の管理」の「新規案件」から、案件ID・案件名などを入力して作成できます。14種のドキュメントには `kickstarter-ingest init` と同じ雛形（記入例）が入るので、Claude との対話や ingest CLI の push で中身を書き換えてください。雛形はサイトで公開している `/templates` から読むため、ingest 側で雛形を直してデプロイすれば反映されます。

「案件の管理」の「提案者と表現チェック」では、全案件の表紙に出す提案者（自社名・担当者）と、クライアント向けの資料に出してはいけない禁止語（社内のあだ名など）を設定します。ingest CLI は push の前に、禁止語と雛形の仮の文字（〇〇）が原稿に残っていないかを調べ、見つかれば push を止めます。原価・粗利・無料枠・TODO などの注意語と「未定」は警告だけ出します。

### 付箋（閲覧中の指示）

案件のページを見ながら、気になった箇所に付箋を貼れます。ヘッダー右上の「付箋」で付箋モードにすると、右上に道具箱が出ます。

- 道具：閲覧（スクロール・付箋を開く）／ペン（手書き）／囲み（ドラッグで囲み、中に文字を入力）／引出線（指したい箇所から引き出す）
- 色：黒・白・赤・青・緑・黄。ペンの「滑らかさ」で点を間引く間隔（1〜6px）と手ぶれ補正の強さを調整できます
- 戻る（Ctrl+Z）で 1 ストロークずつ取り消し、「保存」で書いたものをまとめて 1 枚の付箋にします。ハッシュタグと補足を付けられ、ユーザー名と時刻は自動で付き、状態は open で始まります
- ヘッダーの一覧ボタンで付箋の一覧を開き、open / close・ページ・ハッシュタグで絞り込めます。クリックするとその箇所へ移動して点滅します
- 付箋は書いた位置の近くの要素（見出し・段落・表など）を目印に保存するので、画面幅が変わっても同じ箇所に付きます（幅の比で縮小するため、スマホでは文字が小さくなります。ピンを押すと内容を読めます）

読み書きできる範囲：クライアントは自分の付箋だけを読み書き・削除できます（ほかのクライアントや管理者の付箋は見えません）。管理者は案件のすべての付箋を読めて、状態・ハッシュタグ・補足の変更と削除ができます。書いた人・書いた内容・位置はあとから変えられません。案件を削除すると付箋も消えます。

不要になった案件（試しに push したものなど）は、「案件の管理」で案件の「削除」を押し、確認のため案件IDを入力すると削除できます。原稿（docs）・付箋と、その案件の閲覧権限もまとめて消えます。元の原稿ファイルは残るので、もう一度 push すれば復元できます。

## ドキュメント14種

| type | ファイル | 表示 |
| --- | --- | --- |
| executive-summary | executive-summary.md | Markdown |
| personas | personas.md | Markdown（ユースケース図は Mermaid） |
| requirements | requirements.md | Markdown |
| tech-spec | tech-spec.md | Markdown |
| screens | screens.md | Markdown（` ```mock ` ブロックで画面モック） |
| page-flow | page-flow.md | Mermaid flowchart |
| er-diagram | er-diagram.md | ` ```er ` ブロック → ズーム・検索・ドメイン絞り込みできる ER 図 |
| api | api.yaml | OpenAPI 3 → エンドポイント一覧 |
| roadmap | roadmap.md | ` ```gantt ` ブロック → スクロール・ズームできるガントチャート |
| estimate | estimate.yaml | 表＋合計の自動計算 |
| risks | risks.yaml | 表 |
| test-plan | test-plan.md | Markdown |
| glossary | glossary.yaml | 表（読み順に並べ替え） |
| adr | adr.md | Markdown |

Markdown の原稿には front matter（`title`, `order`）が必要です。不要なドキュメントはファイルを消せば省略されます。

### 図のブロック

Markdown の中に次のコードブロックを書くと、図として描画されます。中身はどれも YAML で、`validate` が書き間違い（存在しない参照先や部品名など）を検出します。書き方は `templates/` の各ファイルの冒頭コメントを見てください。

| ブロック | 用途 | 主な機能 |
| --- | --- | --- |
| ` ```gantt ` | スケジュール | `after` で日付を自動計算、日/週/月の切り替え、今日線、依存の矢印、セクション折りたたみ、全画面 |
| ` ```mock ` | 画面モック | ブラウザ/スマホ枠、入力・表・ボタンなどの部品、`note` 番号で項目表と対応、`to` で遷移先 |
| ` ```er ` | ER 図 | ドメインごとの自動配置、テーブル・列の検索、ドメイン絞り込み、キー列だけ表示、関連ハイライト、ミニマップ |
| ` ```mermaid ` | その他の図 | Mermaid の記法そのまま（ページ遷移図など） |

## デザイントークン

見た目のルールは `web/src/theme.ts` に集約しています。画面や図のコードでは色コードや px を直接書かず、Mantine の props（`c="dimmed"`, `radius="md"` など）か CSS 変数（`var(--mantine-spacing-md)`, `var(--ks-surface)` など）でここの値を参照します。

| トークン | 内容 |
| --- | --- |
| 色 | ブランド色 `brand`（藍）と灰色を含む全色を OKLCH から生成（`web/src/lib/palette.ts`）。どの色相も明るさ・鮮やかさの段階がそろうので、図やバッジで色が混ざっても強さが揃う |
| 面 | `--ks-canvas`（画面の地）、`--ks-surface`（紙・カード）、`--ks-subtle`（表の見出しなど） |
| 図の色 | `theme.other.chartColors` の順にガントのセクションへ割り当て。ER 図のドメイン色も同じ色を使う |
| 余白・角丸・影 | 余白は 4px グリッド（xs 8 / sm 12 / md 16 / lg 24 / xl 40）、角丸は xs〜xl の5段階、影は5段階 |
| 文字 | 書体はゴシック体 Noto Sans JP の1種類だけ（本文・見出し・表・図すべて）。等幅はコード・パス・型名だけ。強弱は書体を変えず、太さ（400 本文 / 500 ラベル / 700 見出し・強調）とサイズで付ける |

ブランド色を案件や会社に合わせて変えるときは、`theme.ts` の `BRAND_HUE`（色相 0〜360）を変更します。

## 新しい案件を追加する

```sh
cd ingest
uv run kickstarter-ingest init my-project --parent ../projects   # 雛形を展開し、id を my-project にする
nvim ../projects/my-project/project.yaml   # members に初期の閲覧者を書いてもよい
uv run kickstarter-ingest validate ../projects/my-project
uv run kickstarter-ingest login https://本番のサイト              # 初回だけ。管理者のアカウントでログイン
uv run kickstarter-ingest push ../projects/my-project            # ログインしたアカウントで投入
```

`push` の書き込み先は次のとおりです。

| 指定 | 書き込み方 |
| --- | --- |
| なし | `login` したアカウントのトークンで、`login` したサイトに書く（Firestore のルールを通るので管理者だけが書ける） |
| `--emulator` | ローカルのエミュレータに Admin SDK で書く |
| `--gcp-project ID` | サービスアカウント鍵（`GOOGLE_APPLICATION_CREDENTIALS`）で Admin SDK から書く |

## Claude から案件を追加する

サイトは、Claude などのエージェント向けに次のファイルをログインなしで公開しています（`pnpm build` のときに ingest から生成。形式の説明だけで、案件の中身は含みません）。

| パス | 内容 |
| --- | --- |
| `/llms.txt` | 案件の追加手順、原稿の形式、CLI の使い方、対話モード（1項目ずつ質問して作る）の進め方 |
| `/schema/index.json` | ドキュメントの一覧と、それぞれの schema・雛形・質問 |
| `/schema/*.json` | 各原稿と図のブロックの JSON Schema。項目の `description` は対話モードの質問を兼ねる |
| `/templates/*` | 雛形 |
| `/cli-config.json` | `login` が使う Web API キーとプロジェクトID（JS にも含まれる公開情報） |

別のリポジトリの Claude に「https://本番のサイト/llms.txt を読んで、新しい案件を作って」と頼むと、手順どおりに CLI を使って原稿を作ります。CLI はどこからでも次の形で実行できます（インストール不要）。

```sh
uvx --from git+https://github.com/ngt22/pj_kickstarter#subdirectory=ingest kickstarter-ingest init my-project
```

ログインは利用者本人が行います（Claude にパスワードやトークンを渡さないため）。

- メールとパスワード: `kickstarter-ingest login https://本番のサイト --email 自分のメール`
- Google アカウントなど: サイトに管理者でログインし、右上の「CLI ログイン」で表示されたトークンを `kickstarter-ingest login https://本番のサイト` に貼り付ける

ログイン情報は `~/.config/kickstarter-ingest/credentials.json`（本人だけが読める権限）に保存されます。`whoami` で確認、`logout` で削除できます。管理者でないアカウントは `login` の時点で断られ、仮にトークンを使っても Firestore のルールが書き込みを拒否します。

`/llms.txt` や schema の文面は `ingest/src/kickstarter_ingest/schema.py`（手順）、`doctypes.py`（ドキュメントごとの質問）、`models.py`（項目の説明）にあります。ローカルで確かめるときは `cd web && pnpm site-assets` で `web/public/` に書き出されます。

### 表紙

案件を開くと、最初に表紙と概要が表示されます。表紙の項目は `project.yaml` に書きます（すべて省略可）。

| 項目 | 内容 |
| --- | --- |
| `client` | クライアント名 |
| `proposed_at` | 提案日（YYYY-MM-DD） |
| `version` | 版 |
| `color` | 表紙のキー色（`brand`, `blue`, `teal` など、テーマにある色の名前） |

概要の数字（開発期間・概算費用・マイルストーン・対応中のリスク）は、ロードマップの ` ```gantt `、`estimate.yaml`、`risks.yaml` から自動で集計します。表紙のために数字を書き直す必要はありません。

`--gcp-project` で投入する場合は、Firebase コンソールで発行したサービスアカウント鍵を `GOOGLE_APPLICATION_CREDENTIALS` に指定してください。鍵はリポジトリに入れないでください。通常は `login` を使えば鍵は不要です。

## ローカルで動かす（エミュレータ）

```sh
# 1. エミュレータ起動（Java 21 以上と pnpm が必要。Ubuntu なら sudo apt install openjdk-21-jre-headless）
cd web && pnpm install
pnpm exec firebase emulators:start --only auth,firestore --project demo-kickstarter

# 2. 別ターミナルでサンプル案件を投入（login したアカウントで試すなら login --emulator --email ...）
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
5. 自分のアカウントでサインアップしてから、`uv run kickstarter-ingest admin grant 自分のメール --gcp-project 本番のID` で管理者にする

```sh
cd web && pnpm build && cd ..   # ingest から llms.txt などを生成するので uv も必要
web/node_modules/.bin/firebase deploy --only hosting,firestore:rules
```

すべて無料の Spark プランで動きます（SSR や Cloud Functions は使っていません）。

## テスト

```sh
cd ingest && uv run pytest        # 原稿の検証
cd web && pnpm test                # 表示ロジック
cd web && pnpm test:rules          # Firestore ルール（エミュレータを自動起動）
cd web && pnpm test:cli            # login → push を Auth / Firestore エミュレータで通しで確認
```
