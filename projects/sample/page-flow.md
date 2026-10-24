---
title: ページ遷移図
order: 6
---

```mermaid
flowchart TD
  top[SC-01 トップ] --> input[SC-02 予約入力]
  input --> confirm[SC-03 確認]
  confirm --> done[SC-04 完了]
  confirm -->|戻る| input
  top --> login[SC-10 管理ログイン]
  login --> list[SC-11 予約一覧]
```
