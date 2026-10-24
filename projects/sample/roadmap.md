---
title: 開発計画書 / ロードマップ
order: 9
---

## マイルストーン

| フェーズ | 完了条件 |
| --- | --- |
| 要件確定 | 要件定義書の承認 |
| MVP | 予約・一覧の基本機能が動く |
| リリース | 受入テスト完了 |

## スケジュール

```gantt
title: 開発スケジュール
sections:
  - name: 準備
    tasks:
      - { id: req, name: 要件定義, start: 2026-11-02, days: 14, owner: PM, progress: 100 }
      - { id: design, name: 基本設計, after: req, days: 10, owner: TL, progress: 60 }
      - { id: env, name: 開発環境の構築, after: req, days: 5, owner: Dev }
      - { name: 要件確定, after: design, milestone: true }
  - name: 開発
    tasks:
      - { id: auth, name: ログイン・会員登録, after: [design, env], days: 10, owner: Dev A }
      - { id: slot, name: 空き枠検索, after: [design, env], days: 12, owner: Dev B }
      - { id: rsv, name: 予約・キャンセル, after: slot, days: 15, owner: Dev B }
      - { id: admin, name: 管理画面, after: auth, days: 20, owner: Dev A }
      - { name: MVP完成, after: [rsv, admin], milestone: true }
  - name: リリース
    tasks:
      - { id: uat, name: 受入テスト, after: [rsv, admin], days: 14, owner: 顧客 }
      - { id: fix, name: 不具合修正, after: uat, days: 7, owner: Dev }
      - { name: 本番リリース, after: fix, milestone: true }
```
