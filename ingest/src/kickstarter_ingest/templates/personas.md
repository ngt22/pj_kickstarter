---
title: ペルソナ / ユースケース
order: 2
---

<!--
ユースケース図は ```usecase ブロックに YAML で書きます。
  system: システム境界の名前
  actors: [{ id, name, note, side: left|right（主な利用者は left、管理者や外部システムは right）, color }]
  cases: [{ id, name（「〜する」の形で短く）, actors: [アクターの id], note }]
  relations: [{ from, to, type: include|extend }]
    include: from が必ず to を含む（例: 予約する → 本人確認する）
    extend: from が条件付きで to を拡張する（例: クーポンを使う → 予約する）
-->

## ペルソナ

### 利用者：佐藤さん（30代・会社員）

- 平日の昼休みにスマホで予約したい
- 電話をかける時間が取れない

### 管理者：店舗スタッフ

- 当日の予約一覧をすぐに確認したい

## ユースケース

```usecase
system: 予約サービス
actors:
  - { id: user, name: 利用者, note: 30代・会社員 }
  - { id: staff, name: 店舗スタッフ, side: right }
  - { id: mail, name: メール配信サービス, side: right }
cases:
  - { id: UC-01, name: 空き枠を探す, actors: [user] }
  - { id: UC-02, name: 予約する, actors: [user] }
  - { id: UC-03, name: 予約を確認・キャンセルする, actors: [user] }
  - { id: UC-04, name: 予約完了を通知する, actors: [mail] }
  - { id: UC-05, name: 予約一覧を見る, actors: [staff] }
  - { id: UC-06, name: 営業枠を設定する, actors: [staff] }
relations:
  - { from: UC-02, to: UC-01, type: include }
  - { from: UC-02, to: UC-04, type: include }
```
