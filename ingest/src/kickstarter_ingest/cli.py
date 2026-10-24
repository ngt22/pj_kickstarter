"""使い方:
  uv run kickstarter-ingest validate ../projects/sample
  uv run kickstarter-ingest push ../projects/sample [--emulator] [--gcp-project ID]
  uv run kickstarter-ingest admin grant you@example.com [--emulator] [--gcp-project ID]
  uv run kickstarter-ingest admin revoke you@example.com
  uv run kickstarter-ingest admin list
"""

import argparse
import os
import sys
from pathlib import Path

from .loader import load_project


def report(path: Path):
    result = load_project(path)
    for m in result.missing:
        print(f"[skip] {m} がないため省略します")
    for e in result.errors:
        print(f"[error] {e}", file=sys.stderr)
    return result


def add_target_args(p: argparse.ArgumentParser, emulator_help: str) -> None:
    p.add_argument("--emulator", action="store_true", help=emulator_help)
    p.add_argument("--gcp-project", help="Firebase のプロジェクトID（省略時は認証情報から推定）")


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kickstarter-ingest")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "push"):
        p = sub.add_parser(name)
        p.add_argument("project_dir", type=Path)
        if name == "push":
            add_target_args(p, "localhost:8080 の Firestore エミュレータに書き込む")
    p = sub.add_parser("admin", help="管理者（全案件を閲覧し、閲覧権限を編集できる）を付け外しする")
    p.add_argument("action", choices=("grant", "revoke", "list"))
    p.add_argument("email", nargs="?")
    add_target_args(p, "localhost:9099 の Auth エミュレータを使う")
    args = parser.parse_args(argv)

    if args.command == "admin":
        return admin(args)

    result = report(args.project_dir)
    if result.errors:
        return 1
    print(f"[ok] {result.meta.id}: {len(result.docs)} 件のドキュメントを検証しました")

    if args.command == "push":
        if args.emulator:
            os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
        from .firestore import push

        gcp_project = args.gcp_project or ("demo-kickstarter" if args.emulator else None)
        count = push(result, gcp_project)
        print(f"[ok] {count} 件を Firestore に投入しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
