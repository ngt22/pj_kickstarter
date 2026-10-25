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

from .doctypes import DOC_TYPES
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
    """ドキュメントの一覧と、それぞれの形式・質問。対話モードはこの順に進める。"""
    return {
        "project": {"file": "project.yaml", "schema": "project.json"},
        "docs": [
            {
                "type": dt.key,
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
    rows = "\n".join(
        f"| {dt.key} | {dt.filename} | {dt.title} | "
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

> 新規案件の提案資料（要件定義書、技術仕様、ロードマップ、画面仕様、ER図、用語集など14種）を Markdown / YAML で書き、
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
{cli} push projects/my-project    # ログイン中のアカウントでサイトに反映
```

### ログイン（利用者本人が実行する）

`login` はパスワードやトークンを入力するので、エージェントは代わりに入力しないでください。利用者に次のどちらかを
自分の端末で実行してもらいます（Claude Code ならプロンプトで `! ` を先頭に付けると実行できます）。

- Google アカウントなど: サイトに管理者でログインし、`/cli-login` を開いて表示されたトークンを貼り付ける
  `{cli} login https://このサイト`
- メールとパスワード: `{cli} login https://このサイト --email 管理者のメール`

ログイン情報は利用者のホームディレクトリ（~/.config/kickstarter-ingest/credentials.json）に保存され、以降の push で使われます。
エージェントはこのファイルを読んだり表示したりしないでください。

## 原稿の形式

- 案件ディレクトリ名と project.yaml の id は同じにする（英小文字・数字・ハイフン）
- Markdown の原稿は先頭に front matter（title, order）が必要。order は雛形の値のままでよい
- 不要なドキュメントはファイルごと削除すれば省略される（project.yaml は必須）
- 雛形には記入例（予約管理サービス）が入っている。すべて案件の内容に置き換え、記入例を残さない
- 本文の図は Markdown のコードブロックに YAML で書く: ```gantt（スケジュール）、```mock（画面モック）、
  ```er（ER図）、```usecase（ユースケース図）、```mermaid（その他。ページ遷移図など）。書き方は各雛形の冒頭コメントと schema/block-*.json を参照
- 画面モック（```mock）は案件カラーの「画面イメージ」として実際の画面に近い見た目で描かれる。先頭の header（上のバー）、
  nav（パソコンの横メニュー）、tabbar（スマホの下のタブ）で画面の骨組みを作り、中身は stats・list・table・card などで
  実際に表示する内容（それらしい名前・日時・件数）を書く。ボタンなどの to: には遷移先の画面ID（SC-xx）を書き、
  note: 番号は直後の項目表の No と合わせる
- 見積もり（estimate.yaml）は初期費用（initial: 人月 × 単価）と月額費用（monthly: 公開後の継続利用料）に分ける。
  資料はクライアントが読むので、サーバー・クラウド利用料・API 料金などの原価は金額も内訳も書かない。月額はサービス
  （例: 運用保守サービス）にまとめ、含まれるものを includes に金額なしで書き、上限があれば limits に書く

| type | ファイル | 内容 | 形式 |
| --- | --- | --- | --- |
| - | project.yaml | 案件の基本情報（表紙） | schema/project.json |
{rows}

- [schema/index.json](schema/index.json): ドキュメントの一覧、形式、対話モードの質問
- 雛形:
{templates}

## 対話モード（空の案件で、1項目ずつ質問して作る）

利用者が「案件を作りたい」「開発ドキュメントを作って」などと頼んだのに内容をまだ渡していないときは、次の手順で進めてください。

1. 最初に基本情報（案件名、クライアント、提案日）を聞き、案件IDを提案して確認し、`init` する
2. 下の質問を **1回に1つずつ** 聞く。まとめて聞かない。schema の description も質問として使える
3. 1つのドキュメント分の回答がそろったら原稿を書き、`validate` を通してから要点を見せて確認する。OK なら次へ進む
4. 利用者が分からない・決まっていない項目は「未定」と書いて先へ進め、メモしておく。最後に未定の項目をまとめて聞き直す
   （聞き直しても決まらない項目は、push の前に「別途ご相談」などクライアント向けの表現に書き換える）
5. 画面仕様からページ遷移図を、要件・ロードマップ・見積もりからエグゼクティブサマリーを下書きするなど、
   既に聞いた内容から書けるものは質問せず下書きを見せて確認する
6. 不要なドキュメントは利用者に確認してから削除する
7. すべてそろったら `validate` を通し、利用者の了承を得てから `push` する（未ログインならログインを頼む）

質問の順番は、基本情報 → 要件定義 → ペルソナ → 画面仕様 → ページ遷移 → ER図 → 技術仕様 → API → ロードマップ →
見積もり → リスク → テスト計画 → 用語集 → ADR → エグゼクティブサマリー（最後にまとめる）を目安にします。

{questions}

## クライアント向け表現ルール

資料は提案先のクライアントがそのまま読みます。社内向けのメモではありません。

- 自社（提案者）の担当者は社内のあだ名やハンドルネームで書かない。提案者の社名と担当者はサイトの設定で表紙に出るので、
  原稿に書く必要はない。書くときは表紙と同じ表記にする
- 原価や社内の事情を書かない: サーバー・クラウド利用料・API 料金の金額や内訳、「無料枠」、粗利、外注先、社内の工数の都合など。
  技術の採用理由は「運用の手間と費用を抑えられる」のようにクライアントにとっての利点で書く
- 地の文は敬体（です・ます）。箇条書きと表は体言止めでよい。クライアント名には「様」を付ける
- 「未定」「TODO」「TBD」のまま提出しない。決まらない項目は「別途ご相談」「要件定義で決定」のように書き換える
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
