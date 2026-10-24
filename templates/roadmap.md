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
# 書き方: タスクは start（開始日）か after（先行タスクの id）で始まり、days（日数）か end（終了日）で長さを決めます。
# どちらも省略すると直前のタスクの続きになります。milestone: true で◆を置けます。
title: 開発スケジュール
sections:
  - name: 準備
    tasks:
      - { id: req, name: 要件定義, start: 2026-01-05, days: 14, owner: PM, progress: 0 }
      - { id: design, name: 設計, after: req, days: 14 }
  - name: 開発
    tasks:
      - { id: impl, name: MVP実装, after: design, days: 30 }
  - name: リリース
    tasks:
      - { id: uat, name: 受入テスト, after: impl, days: 14 }
      - { name: 本番リリース, after: uat, milestone: true }
```
