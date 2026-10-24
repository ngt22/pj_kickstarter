"""Firestore への書き込み。FIRESTORE_EMULATOR_HOST があればエミュレータに書く。"""

import os

import firebase_admin
from firebase_admin import credentials, firestore
from google.auth.credentials import AnonymousCredentials

from .loader import LoadResult


class _EmulatorCredential(credentials.Base):
    """エミュレータは認証不要なので、鍵なしで初期化できるようにする。"""

    def get_credential(self):
        return AnonymousCredentials()


def push(result: LoadResult, gcp_project: str | None) -> int:
    assert result.meta is not None
    options = {"projectId": gcp_project} if gcp_project else None
    if not firebase_admin._apps:
        # 本番は GOOGLE_APPLICATION_CREDENTIALS のサービスアカウント鍵を使う
        cred = _EmulatorCredential() if os.environ.get("FIRESTORE_EMULATOR_HOST") else None
        firebase_admin.initialize_app(credential=cred, options=options)
    db = firestore.client()

    project_ref = db.collection("projects").document(result.meta.id)
    batch = db.batch()
    batch.set(project_ref, {**result.meta.model_dump(), "updatedAt": firestore.SERVER_TIMESTAMP})

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
    return len(result.docs)
