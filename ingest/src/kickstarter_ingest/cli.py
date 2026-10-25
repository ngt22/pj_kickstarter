"""使い方:
  uv run kickstarter-ingest init my-project [--parent projects]
  uv run kickstarter-ingest validate ../projects/sample
  uv run kickstarter-ingest schema [名前] [--out DIR]
  uv run kickstarter-ingest site-assets ../web/public
  uv run kickstarter-ingest login https://サイト [--email 管理者のメール]   （または --emulator）
  uv run kickstarter-ingest whoami | logout
  uv run kickstarter-ingest push ../projects/sample                  （login したアカウントで書き込む）
  uv run kickstarter-ingest push ../projects/sample (--emulator | --gcp-project ID)   （Admin SDK で書き込む）
  uv run kickstarter-ingest admin grant you@example.com (--emulator | --gcp-project ID)
  uv run kickstarter-ingest admin revoke you@example.com (--emulator | --gcp-project ID)
  uv run kickstarter-ingest admin list (--emulator | --gcp-project ID)
"""

import argparse
import getpass
import json
import os
import sys
from pathlib import Path

from .loader import LoadResult, load_project
from .wording import check_wording


def report(path: Path):
    result = load_project(path)
    for m in result.missing:
        print(f"[skip] {m} がないため省略します")
    for e in result.errors:
        print(f"[error] {e}", file=sys.stderr)
    for w in result.warnings:
        print(f"[warn] {w}")
    return result


def report_wording(result: LoadResult, forbidden_terms: list[str] = (), push: bool = False) -> bool:
    """表現チェックの結果を表示し、push を止めるべきものがあれば False を返す。"""
    wording = check_wording(result, forbidden_terms)
    for f in wording.blocking:
        # validate では止めない（対話モードで書きかけのまま検証するため）。push では止める
        level, when = ("[error]", "") if push else ("[warn]", "。push する前に直してください")
        print(f"{level} {f} はクライアント向けの資料に出せません（禁止語・雛形の仮の文字）{when}", file=sys.stderr)
    for f in wording.warnings:
        print(f"[warn] {f} がクライアント向けの表現か確認してください")
    if wording.undecided:
        print(f"[warn] 「未定」が {wording.undecided} 箇所あります。提出前に決めるか「別途ご相談」などに書き換えてください")
    return not wording.blocking


def add_target_args(p: argparse.ArgumentParser, emulator_help: str) -> None:
    p.add_argument("--emulator", action="store_true", help=emulator_help)
    p.add_argument("--gcp-project", help="本番の Firebase プロジェクトID（--emulator を付けないときは必須）")


def admin(args: argparse.Namespace) -> int:
    from firebase_admin import auth

    from .firestore import list_admins, set_admin

    if args.emulator:
        os.environ.setdefault("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
    gcp_project = args.gcp_project or ("demo-kickstarter" if args.emulator else None)

    if args.action == "list":
        for email in list_admins(gcp_project):
            print(email)
        return 0
    if not args.email:
        print("[error] メールアドレスを指定してください", file=sys.stderr)
        return 1
    try:
        set_admin(args.email.lower(), args.action == "grant", gcp_project)
    except auth.UserNotFoundError:
        print(f"[error] {args.email} のユーザーがいません。先にサイトでサインアップしてもらってください", file=sys.stderr)
        return 1
    verb = "付与" if args.action == "grant" else "解除"
    print(f"[ok] {args.email} の管理者権限を{verb}しました（反映は次回ログイン時、または約1時間後）")
    return 0


def init(args: argparse.Namespace) -> int:
    from .schema import scaffold

    dest = args.parent / args.project_id
    if dest.exists():
        print(f"[error] {dest} はすでにあります", file=sys.stderr)
        return 1
    scaffold(args.project_id, dest)
    print(f"[ok] {dest} に雛形を作りました。記入例をすべて案件の内容に置き換えてください")
    return 0


def schema(args: argparse.Namespace) -> int:
    from .schema import json_schema, schema_index, schema_models, write_schemas

    if args.out:
        for path in write_schemas(args.out):
            print(f"[ok] {path}")
        return 0
    if args.name and args.name not in schema_models():
        print(f"[error] {args.name} の schema はありません（{', '.join(schema_models())}）", file=sys.stderr)
        return 1
    print(json.dumps(json_schema(args.name) if args.name else schema_index(), ensure_ascii=False, indent=2))
    return 0


def site_assets(args: argparse.Namespace) -> int:
    """サイトで公開する llms.txt・schema・雛形を書き出す（web のビルド時に実行する）。"""
    import shutil

    from .schema import CLI_SOURCE, TEMPLATES, llms_txt, write_schemas

    out: Path = args.out
    for name in ("schema", "templates"):
        shutil.rmtree(out / name, ignore_errors=True)
    write_schemas(out / "schema")
    shutil.copytree(TEMPLATES, out / "templates")
    (out / "llms.txt").write_text(llms_txt(os.environ.get("KICKSTARTER_CLI_SOURCE", CLI_SOURCE)), encoding="utf-8")
    print(f"[ok] {out} に llms.txt、schema/、templates/ を書き出しました")
    return 0


def login(args: argparse.Namespace) -> int:
    from .remote import Credentials, RemoteError, check_admin, id_token, save_credentials, sign_in_with_password, site_config

    try:
        if args.emulator:
            creds = Credentials("emulator", "demo-key", "demo-kickstarter", "")
        elif args.site:
            api_key, project_id = site_config(args.site)
            creds = Credentials(args.site.rstrip("/"), api_key, project_id, "")
        else:
            print("[error] サイトの URL を指定してください（ローカルのエミュレータなら --emulator）", file=sys.stderr)
            return 1
        if args.email:
            password = os.environ.get("KICKSTARTER_PASSWORD") or getpass.getpass(f"{args.email} のパスワード: ")
            sign_in_with_password(creds, args.email, password)
        else:
            page = "http://localhost:5173" if creds.emulator else creds.site
            print(f"サイトに管理者でログインし、{page}/cli-login を開いて表示されたトークンを貼り付けてください")
            creds.refresh_token = getpass.getpass("トークン: ").strip()
        claims = check_admin(id_token(creds))
    except RemoteError as e:
        print(f"[error] {e}", file=sys.stderr)
        return 1
    creds.email = claims.get("email", "")
    path = save_credentials(creds)
    print(f"[ok] {creds.email}（管理者）でログインしました。書き込み先: {creds.project_id}（{path} に保存）")
    return 0


def whoami(_: argparse.Namespace) -> int:
    from .remote import load_credentials

    creds = load_credentials()
    if creds is None:
        print("ログインしていません")
        return 1
    print(f"{creds.email} / 書き込み先: {creds.project_id}（{creds.site}）")
    return 0


def logout(_: argparse.Namespace) -> int:
    from .remote import delete_credentials

    print("[ok] ログアウトしました" if delete_credentials() else "ログインしていません")
    return 0


COMMANDS = {"admin": admin, "init": init, "schema": schema, "site-assets": site_assets, "login": login, "whoami": whoami, "logout": logout}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kickstarter-ingest")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("init", help="雛形から新しい案件のディレクトリを作る")
    p.add_argument("project_id")
    p.add_argument("--parent", type=Path, default=Path("projects"), help="案件ディレクトリを作る場所（既定: projects）")
    for name in ("validate", "push"):
        p = sub.add_parser(name)
        p.add_argument("project_dir", type=Path)
        if name == "push":
            add_target_args(p, "localhost:8080 の Firestore エミュレータに Admin SDK で書き込む")
    p = sub.add_parser("schema", help="原稿の形式（JSON Schema）を出力する")
    p.add_argument("name", nargs="?", help="省略するとドキュメントの一覧と質問を出力")
    p.add_argument("--out", type=Path, help="すべての schema をこのディレクトリに書き出す")
    p = sub.add_parser("site-assets", help="サイトで公開する llms.txt・schema・雛形を書き出す")
    p.add_argument("out", type=Path)
    p = sub.add_parser("login", help="管理者のアカウントでログインし、push で使う")
    p.add_argument("site", nargs="?", help="サイトの URL（https://...）")
    p.add_argument("--email", help="メールとパスワードでログインする（省略するとサイトで発行したトークンを貼り付ける）")
    p.add_argument("--emulator", action="store_true", help="localhost:9099 の Auth エミュレータにログインする")
    sub.add_parser("whoami", help="ログイン中のアカウントを表示する")
    sub.add_parser("logout", help="保存したログイン情報を消す")
    p = sub.add_parser("admin", help="管理者（全案件を閲覧し、閲覧権限を編集できる）を付け外しする")
    p.add_argument("action", choices=("grant", "revoke", "list"))
    p.add_argument("email", nargs="?")
    add_target_args(p, "localhost:9099 の Auth エミュレータを使う")
    args = parser.parse_args(argv)
    # 認証情報の既定プロジェクトに暗黙で接続すると、無関係な GCP プロジェクトを操作しかねないので明示させる。
    # push は login 済みならその書き込み先（login 時に明示したサイト）を使う
    if args.command == "admin" and not args.emulator and not args.gcp_project:
        parser.error("本番に接続するには --gcp-project を指定してください（ローカルのエミュレータなら --emulator）")

    if args.command in COMMANDS:
        return COMMANDS[args.command](args)

    result = report(args.project_dir)
    if result.errors:
        return 1
    print(f"[ok] {result.meta.id}: {len(result.docs)} 件のドキュメントを検証しました")

    if args.command == "push":
        return push(args, result)
    # validate はオフラインで動くよう、サイト共通の禁止語は見ない（push 時に確認する）
    report_wording(result)
    return 0


def push(args: argparse.Namespace, result) -> int:
    if args.emulator or args.gcp_project:
        if args.emulator:
            os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
        from .firestore import push as admin_push

        from .firestore import forbidden_terms

        gcp_project = args.gcp_project or ("demo-kickstarter" if args.emulator else None)
        if not report_wording(result, forbidden_terms(gcp_project), push=True):
            print("[error] 上の語を直してから push してください", file=sys.stderr)
            return 1
        count = admin_push(result, gcp_project)
        print(f"[ok] {count} 件を Firestore に投入しました")
        return 0

    from . import remote

    creds = remote.load_credentials()
    if creds is None:
        print(
            "[error] ログインしていません。`kickstarter-ingest login https://サイト` で管理者としてログインしてください"
            "（Admin SDK で書くなら --emulator か --gcp-project）",
            file=sys.stderr,
        )
        return 1
    try:
        if not report_wording(result, remote.forbidden_terms(creds), push=True):
            print("[error] 上の語を直してから push してください", file=sys.stderr)
            return 1
        count = remote.push(result, creds)
    except remote.RemoteError as e:
        print(f"[error] {e}", file=sys.stderr)
        return 1
    print(f"[ok] {creds.email} として {count} 件を {creds.project_id}（{creds.site}）に反映しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
