"""使い方:
  uv run kickstarter-ingest validate ../projects/sample
  uv run kickstarter-ingest push ../projects/sample [--emulator] [--gcp-project ID]
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kickstarter-ingest")
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "push"):
        p = sub.add_parser(name)
        p.add_argument("project_dir", type=Path)
        if name == "push":
            p.add_argument("--emulator", action="store_true", help="localhost:8080 の Firestore エミュレータに書き込む")
            p.add_argument("--gcp-project", help="Firebase のプロジェクトID（省略時は認証情報から推定）")
    args = parser.parse_args(argv)

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
