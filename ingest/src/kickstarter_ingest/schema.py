"""原稿の形式を機械が読める形で書き出す（JSON Schema、雛形、llms.txt）。

サイトのビルド時に site-assets で web/public に出力し、Firebase Hosting で公開する。
中身は形式の説明だけで、案件の内容は含まない。
"""

import json
import re
import shutil
from importlib.resources import files
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from .doctypes import DOC_TYPES, PARTS
from .models import BLOCK_MODELS, YAML_MODELS, DocHeader, ProjectMeta

TEMPLATES = Path(str(files("kickstarter_ingest") / "templates"))

# 別のリポジトリから CLI を使うときのインストール元
CLI_SOURCE = "git+https://github.com/ngt22/pj_kickstarter#subdirectory=ingest"


def schema_models() -> dict[str, type[BaseModel]]:
    """schema の名前 → モデル。名前は schema/<名前>.json のファイル名になる。"""
    return {
        "project": ProjectMeta,
        "front-matter": DocHeader,
        **{key: model for key, model in YAML_MODELS.items()},
        **{f"block-{lang}": model for lang, model in BLOCK_MODELS.items()},
    }


def json_schema(name: str) -> dict[str, Any]:
    model = schema_models()[name]
    return {"$schema": "https://json-schema.org/draft/2020-12/schema", "$id": f"{name}.json", **model.model_json_schema()}


def schema_index() -> dict[str, Any]:
    """ドキュメントの一覧（資料の並び順）と、それぞれの部・形式・質問。"""
    return {
        "project": {"file": "project.yaml", "schema": "project.json"},
        "parts": [{"key": key, "title": title} for key, title in PARTS],
        "docs": [
            {
                "type": dt.key,
                "part": dt.part,
                "file": dt.filename,
                "format": dt.format,
                "title": dt.title,
                "schema": f"{dt.key}.json" if dt.format == "yaml" else "front-matter.json",
                "blocks": [f"block-{b}.json" for b in dt.blocks],
                "template": f"templates/{dt.filename}",
                "questions": list(dt.questions),
            }
            for dt in DOC_TYPES
        ],
        "blocks": {lang: f"block-{lang}.json" for lang in BLOCK_MODELS},
    }


def write_schemas(out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name in schema_models():
        path = out / f"{name}.json"
        path.write_text(json.dumps(json_schema(name), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(path)
    index = out / "index.json"
    index.write_text(json.dumps(schema_index(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return [index, *written]


def scaffold(project_id: str, dest: Path) -> None:
    """雛形を dest にコピーし、project.yaml の id を合わせる。記入例の閲覧者は残さない。"""
    shutil.copytree(TEMPLATES, dest)
    meta = dest / "project.yaml"
    text = meta.read_text(encoding="utf-8")
    text = re.sub(r"^id: .*$", f"id: {project_id}", text, count=1, flags=re.M)
    text = re.sub(r"^members:\n(?:  - .*\n)*", "members: []\n", text, count=1, flags=re.M)
    meta.write_text(text, encoding="utf-8")


def llms_txt(cli_source: str = CLI_SOURCE) -> str:
    cli = f"uvx --from {cli_source} kickstarter-ingest"
    part_titles = dict(PARTS)
    rows = "\n".join(
        f"| {part_titles[dt.part]} | {dt.key} | {dt.filename} | {dt.title} | "
        + (f"schema/{dt.key}.json" if dt.format == "yaml" else "schema/front-matter.json")
        + "".join(f", schema/block-{b}.json" for b in dt.blocks)
        + " |"
        for dt in DOC_TYPES
    )
    questions = "\n".join(
        f"- {dt.title}（{dt.filename}）\n" + "\n".join(f"  - {q}" for q in dt.questions) for dt in DOC_TYPES
    )
    templates = "\n".join(f"- [{name}](templates/{name})" for name in sorted(p.name for p in TEMPLATES.iterdir()))
    return LLMS_TXT.format(cli=cli, rows=rows, questions=questions, templates=templates)


LLMS_TXT = """\
# Kickstarter

> 新規案件の提案資料（要件定義書、技術仕様、ロードマップ、画面仕様、ER図、体制・進め方、運用・保守、前提条件・確認事項、用語集など17種）を Markdown / YAML で書き、
> このサイトで閲覧するための仕組みです。このファイルは、Claude などのエージェントが案件を追加・更新する手順をまとめたものです。

このファイルにあるパスは、このファイルと同じサイトからの相対パスです（例: このファイルが https://example.web.app/llms.txt なら
schema/index.json は https://example.web.app/schema/index.json）。案件の中身はログインした人にしか見えず、ここには含まれません。

## 全体の流れ

1. 原稿は利用者のリポジトリ（またはローカルの作業ディレクトリ）に、案件ごとのディレクトリとして置く
2. `init` で雛形を展開する
3. 原稿を書く。形式は schema/ の JSON Schema と templates/ の記入例に従う
4. `validate` がエラーなしで通るまで直す
5. 利用者に内容を確認してもらってから `push` でサイトに反映する

書き込みは管理者だけができます（サイトのルールで、管理者以外の書き込みは拒否されます）。

## CLI

Python のツール uv があれば、どのディレクトリからでも実行できます（インストール不要）。

```sh
{cli} init my-project            # projects/my-project に雛形を展開（--parent で親ディレクトリを変更）
{cli} validate projects/my-project
{cli} schema                      # 形式の一覧（schema/index.json と同じ）
{cli} schema risks                # 1種類の JSON Schema
{cli} login https://このサイト      # 管理者のログイン（利用者本人が実行する。下記）
{cli} whoami                      # ログイン中のアカウントと書き込み先
{cli} logout                      # 保存したログイン情報を消す
{cli} push projects/my-project    # ログイン中のアカウントでサイトに反映
{cli} mock projects/my-project ../my-mock/dist   # 画面モックを案件専用の Hosting サイトにデプロイし、links に追記
```

### ログイン（利用者本人が実行する）

`login` はパスワードやトークンを入力するので、エージェントは代わりに入力しないでください。利用者に次のどちらかを
自分の端末で実行してもらいます（Claude Code ならプロンプトで `! ` を先頭に付けると実行できます）。

- Google アカウントなど: サイトに管理者でログインし、`/cli-login` を開いて表示されたトークンを貼り付ける
  `{cli} login https://このサイト`
- メールとパスワード: `{cli} login https://このサイト --email 管理者のメール`

ログイン情報は利用者のホームディレクトリ（~/.config/kickstarter-ingest/credentials.json）に保存され、以降の push で使われます。
エージェントはこのファイルを読んだり表示したりしないでください。

管理者の付け外し（`admin grant|revoke|list`）は、サイトの運用者が Google Cloud の認証情報を使って実行するコマンドです。
エージェントが案件を書くときには使いません。クライアントの閲覧権限はサイトの「案件の管理」で設定します。

## 原稿の形式

- 案件ディレクトリ名と project.yaml の id は同じにする（英小文字・数字・ハイフン）
- project.yaml の name・summary・client（例: 〇〇株式会社 様）・proposed_at（YYYY-MM-DD）・version（版）・color（表紙のキー色）は
  表紙に出る。status は draft（作成中）→ proposed（提案済み）→ approved（承認）→ archived（終了）
- Markdown の原稿は先頭に front matter（title）が必要。資料の並び順は種類で決まる（下の表の順。古い原稿の order は無視される）
- 不要なドキュメントはファイルごと削除すれば省略される（project.yaml は必須）
- 雛形には記入例（予約管理サービス）が入っている。すべて案件の内容に置き換え、記入例を残さない
- 本文の図は Markdown のコードブロックに YAML で書く: ```gantt（スケジュール）、```mock（画面モック）、
  ```er（ER図）、```usecase（ユースケース図）、```flow（ページ遷移図）、```arch（システム構成図）、```mermaid（その他）。書き方は各雛形の冒頭コメントと schema/block-*.json を参照
- 画面モック（```mock）は案件カラーの「画面イメージ」として実際の画面に近い見た目で描かれる。device は最初に見せる端末で、
  読む人はパソコン／スマートフォンを切り替えて見られる（両方で使う画面も1つの原稿で書く）。タブレットでも使う画面は
  devices: [desktop, tablet, mobile]、ホーム画面に追加して使う PWA なら pwa: true（ブラウザ／アプリ表示の切り替え）を書く。先頭の header（上のバー）、
  nav（パソコンの横メニュー）、tabbar（スマホの下のタブ）で画面の骨組みを作り、中身は stats・list・table・card などで
  実際に表示する内容（それらしい名前・日時・件数）を書く。ボタンなどの to: には遷移先の画面ID（SC-xx）を書き、
  note: 番号は直後の項目表の No と合わせる。図面の上で位置を指す画面（点検の指摘位置、座席、設備の配置など）は
  drawing（rooms に部屋名、pins に {{x, y: 図面に対する %, label, status: new|prev|done, text}}）で描く。指摘の区分で塗り分けるときは
  groups: [{{id: bldg, label: 建築物, color: red}}] を書き、ピンに group: bldg を付ける（凡例に区分が出る）。
  row は列を等分に並べる。幅の比を変えるときは row: {{items: [...], widths: [1, 2, 1.3]}}（スマホでは縦に積む）
- ユースケース図（```usecase）は線を使わず、区画（zones: 使う場所・端末。例: 現地 / 事務所）→ アクターの段 → カードの順に並ぶ。
  区画の間の受け渡し（例: 帰社後に同期）は flows、条件付きの操作は condition、上位の役割（例: 管理者は事務員の全操作＋α）は
  inherits で書く。外部サービスは kind: system。ユースケース名は「〜する」の形で全角16文字以内
- システム構成図（```arch）は区画（zones: 利用者の端末 / クラウド / 外部サービスなど）を上から重ね、区画の中に
  役割のカード（nodes: name は役割、tech は技術名、kind でアイコン）を置き、links で結ぶ。利用者は kind: user、
  外部サービスの区画は external: true、通知や定期処理は type: async。構成は名前の分かる粒度（5〜12枚）にとどめる
- ページ遷移図（```flow）はユースケース図と同じ区画（zones）で分け、区画の中を lanes（例: 日常業務 / 設定）で分ける。
  画面の id は画面仕様の見出し（## SC-xx）と同じにし、画面仕様の ```mock の to: もその id にそろえる（validate で照合する）。
  線は同じレーンの中だけ。確定・キャンセルで戻る線は type: back、区画の間の受け渡しは flows、欠番や省略した戻り線は
  footnote / notes で説明する
- 補足資料は project.yaml の links（画面モック・参考サイトの URL）と files（PDF などのファイル）に書く。表紙と
  「補足資料」のページに一覧で出る。利用者が画面モックやプロトタイプの URL を渡したら、links に title（例: 画面モック（Figma））・
  url・note（何が確認できるか）を足す。ファイルは案件ディレクトリの attachments/ に置き、files に path・title・note を書く
  （1 ファイル 10MB まで。push でサイトに送られ、閲覧権限のある人だけが開ける）。名前と説明もクライアントが読む
- 静的にビルドした画面モック（index.html がある dist など）は `mock` で案件専用の Hosting サイトにデプロイでき、
  project.yaml の links への追記まで自動で行う（次の push でサイトに出る）。デプロイは利用者の端末の firebase CLI を使うので、
  利用者の了承を得てから実行する。モックのサイトは URL を知っていれば誰でも開けるため、実データや社外秘の情報を入れない。
  mock_site はコマンドが書くので手で書かない
- 体制・進め方（team.md）は発注側（貴社）と受注側（当社）の役割と責任、会議と報告、納品物と検収の条件、
  貴社にお願いすることを表で書く。スケジュールはロードマップ、受入テストの中身はテスト計画に書き、ここでは重ねない
- 運用・保守（operations.md）は保守の範囲（月額に含む／含まない）、問い合わせと障害対応、バックアップと監視、
  月額費用に含まれるものを書く。月額の内容は見積もりの monthly（includes・limits）とそろえ、金額は見積もりだけに書く
- 前提条件・確認事項（assumptions.md）は、提案が前提にしていること（A-01…）と、クライアントに決めていただく事項
  （Q-01…: 確認事項と関係する資料・ご判断いただく方・期限・状態）の 2 つの表で書く。決まったら関係する資料を書き換え、状態を「決定」にする
- ER図（```er）の label（日本語名）と列の type・note は、PDF では図の下の「テーブル定義」の表にそのまま載る。
  PDF の図はキー列だけの見取り図になるので、列の意味は note に書く
- 見積もり（estimate.yaml）は初期費用（initial: 人月 × 単価）と月額費用（monthly: 公開後の継続利用料）に分ける。
  資料はクライアントが読むので、サーバー・クラウド利用料・API 料金などの原価は金額も内訳も書かない。月額はサービス
  （例: 運用保守サービス）にまとめ、含まれるものを includes に金額なしで書き、上限があれば limits に書く

資料は次の順に、部（第1部 提案の概要 〜 付録）ごとにまとめて表示されます。

| 部 | type | ファイル | 内容 | 形式 |
| --- | --- | --- | --- | --- |
| - | - | project.yaml | 案件の基本情報（表紙） | schema/project.json |
{rows}

- [schema/index.json](schema/index.json): ドキュメントの一覧、形式、対話モードの質問
- 雛形:
{templates}

## PDF（提出用）

案件のページ上部の PDF のアイコン（全資料を PDF で保存）を押すと、表紙・目次・提案概要と全資料を A4 縦にまとめたページ（`/projects/<案件ID>/print`）が開きます。
ブラウザの印刷から「PDF に保存」で提出用の PDF になります（サーバーでの生成はありません）。原稿は Web と PDF で共通なので、次に気を付けます。

- 資料ごとに改ページされ、ページの上に案件名と資料名、下に提案者・版と提案日・ページ番号が入る。版と提案日は project.yaml の version・proposed_at
- PDF では図が印刷向けに置き換わる: ```gantt は静的なスケジュール表、```flow は図＋「画面遷移の一覧」、```er はキー列だけの図＋テーブル定義、
  ```mock は端末の枠つきで最初の device（と display）の 1 枚だけ。端末や表示の切り替えは PDF には出ないので、提出で見せたい端末を device にする
- 表は用紙の幅に収まるよう、列を増やしすぎない。長い説明は表の外の文章に書く

## 付箋（閲覧者からの指摘）

閲覧者（クライアントと管理者）はサイトのページに「付箋」で指摘を書き込めます。付箋の一覧の「すべてコピー」や各付箋のコピーで、
`# 提案資料「…」への指摘（N 件）` で始まる Markdown がクリップボードに入ります。利用者がこれを貼り付けて直しを頼んだら、次のように進めてください。

1. 指摘ごとに「ページ」（資料名と URL）と「指している箇所」（見出し、要素の文字、CSS セレクタ）から、直す原稿のファイルと箇所を特定する
2. 原稿を直す。指摘の意図が分からないものや、ほかの資料（見積もりなど）に波及するものは、直す前に利用者に確認する
3. `validate` を通し、直した箇所の一覧を見せて了承を得てから `push` する
4. 付箋の状態（open / close）はサイトで管理者が変えるので、push したら利用者に「対応済みの付箋を close にしてください」と伝える

付箋はサイトにだけ保存され、原稿には含まれません。push しても付箋は消えません。

## 対話モード（空の案件で、1項目ずつ質問して作る）

利用者が「案件を作りたい」「開発ドキュメントを作って」などと頼んだのに内容をまだ渡していないときは、次の手順で進めてください。

1. 最初に基本情報（案件名、クライアント、提案日）を聞き、案件IDを提案して確認し、`init` する
2. 下の質問を **1回に1つずつ** 聞く。まとめて聞かない。schema の description も質問として使える
3. 1つのドキュメント分の回答がそろったら原稿を書き、`validate` を通してから要点を見せて確認する。OK なら次へ進む
4. 利用者が分からない・決まっていない項目は「未定」と書いて先へ進め、メモしておく。最後に未定の項目をまとめて聞き直す
   （聞き直しても決まらない項目は、push の前に前提条件・確認事項（assumptions.md）の確認事項に移し、元の箇所は「確認事項 Q-01 参照」とする）
5. 画面仕様からページ遷移図を、要件・ロードマップ・見積もりからエグゼクティブサマリーを下書きするなど、
   既に聞いた内容から書けるものは質問せず下書きを見せて確認する
6. 不要なドキュメントは利用者に確認してから削除する
7. すべてそろったら `validate` を通し、利用者の了承を得てから `push` する（未ログインならログインを頼む）

質問の順番は、基本情報 → 要件定義 → ペルソナ → 画面仕様 → ページ遷移 → ER図 → 技術仕様 → API → ロードマップ →
体制・進め方 → テスト計画 → 運用・保守 → リスク → 前提条件・確認事項 → 見積もり → 用語集 → ADR → エグゼクティブサマリー（最後にまとめる）を目安にします。
運用・保守は見積もりの月額と、体制・進め方はロードマップの担当と矛盾しないようにします。

{questions}

## クライアント向け表現ルール

資料は提案先のクライアントがそのまま読みます。社内向けのメモではありません。

- 自社（提案者）の担当者は社内のあだ名やハンドルネームで書かない。提案者の社名と担当者はサイトの設定で表紙に出るので、
  原稿に書く必要はない。書くときは表紙と同じ表記にする
- 原価や社内の事情を書かない: サーバー・クラウド利用料・API 料金の金額や内訳、「無料枠」、粗利、外注先、社内の工数の都合など。
  技術の採用理由は「運用の手間と費用を抑えられる」のようにクライアントにとっての利点で書く
- 地の文は敬体（です・ます）。箇条書きと表は体言止めでよい。クライアント名には「様」を付ける
- 「未定」「TODO」「TBD」のまま提出しない。決まらない項目は前提条件・確認事項の確認事項（ID・ご判断いただく方・期限）に書き、
  元の箇所は「確認事項 Q-01 参照」とする。社内の検討の中身（価格の考え方、迷っている技術の比較など）は書かない
- クライアントのメールアドレスは、利用者に確認できたものだけを project.yaml の members に書く。分からなければ空でよい
- 雛形の記入例（予約管理サービス、〇〇株式会社など）を残さない

`validate` と `push` は次を原稿から探します（HTML コメントと YAML のコメントは対象外）。

- 禁止語（サイトの管理画面と project.yaml の forbidden_terms で指定）と雛形の仮の文字（〇〇）: validate では警告、push ではエラーで止まる
- 原価・粗利・無料枠・TODO などの注意語: 警告。クライアント側の話として正しく使っている（例: 御社の利益率の向上）なら残してよい
- 「未定」: 件数を表示する

警告が出たら、該当箇所と直し方の案を利用者に列挙して確認してから push してください。

## 守ること

- `push` は利用者の確認を取ってから実行する。push すると、閲覧権限のあるクライアントにもすぐ見える
- project.yaml の members に書いたメールアドレスは、新しい案件を初めて push したときに閲覧者として登録される。
  利用者に確認したアドレスだけを書く
- サービスアカウントの鍵やパスワードを原稿やリポジトリに書かない
"""
