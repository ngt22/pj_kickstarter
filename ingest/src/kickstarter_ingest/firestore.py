"""Firestore / Auth への書き込み。FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST があればエミュレータに書く。"""

import os

import firebase_admin
from firebase_admin import auth, credentials, firestore
from google.auth.credentials import AnonymousCredentials

from .loader import LoadResult

# 1 回の書き込みで送るファイルの断片の数（Firestore の 1 リクエストは 10MiB まで）
BLOBS_PER_BATCH = 4
from .models import ProjectMeta


class _EmulatorCredential(credentials.Base):
    """エミュレータは認証不要なので、鍵なしで初期化できるようにする。"""

    def get_credential(self):
        return AnonymousCredentials()


def _init(gcp_project: str | None) -> None:
    if firebase_admin._apps:
        return
    options = {"projectId": gcp_project} if gcp_project else None
    # 本番は GOOGLE_APPLICATION_CREDENTIALS のサービスアカウント鍵を使う
    on_emulator = os.environ.get("FIRESTORE_EMULATOR_HOST") or os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")
    firebase_admin.initialize_app(credential=_EmulatorCredential() if on_emulator else None, options=options)


def push(result: LoadResult, gcp_project: str | None) -> int:
    assert result.meta is not None
    _init(gcp_project)
    db = firestore.client()

    project_ref = db.collection("projects").document(result.meta.id)
    is_new = not project_ref.get().exists

    # 補足資料のファイルは、案件ドキュメントが参照する前に中身（blobs）を置く。中身のハッシュが ID なので、変わっていなければ送らない
    blobs = project_ref.collection("blobs")
    existing_blobs = {s.id for s in blobs.select(["file"]).stream()}
    pending = [
        (blob_id, f.id, i, chunk)
        for f in result.files
        for i, (blob_id, chunk) in enumerate(zip(f.blob_ids(), f.chunks()))
        if blob_id not in existing_blobs
    ]
    for i in range(0, len(pending), BLOBS_PER_BATCH):
        batch = db.batch()
        for blob_id, file_id, index, chunk in pending[i : i + BLOBS_PER_BATCH]:
            batch.set(blobs.document(blob_id), {"file": file_id, "index": index, "data": chunk})
        batch.commit()

    batch = db.batch()
    # 閲覧者は案件ドキュメントに載せない（クライアント同士でメールが見えないように access に分ける）
    batch.set(
        project_ref,
        {
            **result.meta.model_dump(exclude=ProjectMeta.SITE_EXCLUDE),
            "files": [f.record() for f in result.files],
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
    )
    # members は新規案件の初期値としてだけ使う。以降は管理画面で外した人を push で戻さないよう、触らない
    for email in result.meta.members if is_new else []:
        batch.set(
            db.collection("access").document(email),
            {"projects": firestore.ArrayUnion([result.meta.id]), "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True,
        )

    keep = set()
    for doc in result.docs:
        keep.add(doc.type)
        batch.set(
            project_ref.collection("docs").document(doc.type),
            {
                "type": doc.type,
                "title": doc.title,
                "order": doc.order,
                "format": doc.format,
                "body": doc.body,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
        )
    # 原稿から消したドキュメントは Firestore からも消す
    for snap in project_ref.collection("docs").stream():
        if snap.id not in keep:
            batch.delete(snap.reference)
    batch.commit()

    # 原稿から外したファイルの中身を消す
    keep_blobs = {b for f in result.files for b in f.blob_ids()}
    stale = sorted(existing_blobs - keep_blobs)
    for i in range(0, len(stale), 500):
        batch = db.batch()
        for blob_id in stale[i : i + 500]:
            batch.delete(blobs.document(blob_id))
        batch.commit()
    return len(result.docs)


def forbidden_terms(gcp_project: str | None) -> list[str]:
    """管理画面で設定したサイト共通の禁止語（settings/private）。未設定なら空。"""
    _init(gcp_project)
    snap = firestore.client().collection("settings").document("private").get()
    return list((snap.to_dict() or {}).get("forbidden_terms", [])) if snap.exists else []


def set_admin(email: str, admin: bool, gcp_project: str | None) -> None:
    """カスタムクレーム admin を付け外しする。ユーザーは先にサインアップしている必要がある。"""
    _init(gcp_project)
    user = auth.get_user_by_email(email)
    claims = {k: v for k, v in (user.custom_claims or {}).items() if k != "admin"}
    if admin:
        claims["admin"] = True
    auth.set_custom_user_claims(user.uid, claims or None)


def list_admins(gcp_project: str | None) -> list[str]:
    _init(gcp_project)
    return sorted(u.email for u in auth.list_users().iterate_all() if (u.custom_claims or {}).get("admin") is True)
