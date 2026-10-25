---
title: ペルソナ / ユースケース
order: 2
---

<!--
ユースケース図は ```usecase ブロックに YAML で書きます。線は使わず、区画 → アクターの段 → ユースケースのカードの順に並びます。
  system: システムの名前（zones を省略したときの区画名）
  zones: [{ id, name, note, color }]（使う場所・端末で分ける区画。例: 現地 / 事務所、お客さま / 店舗）
  actors: [{ id, name, note, zone: 区画の id, kind: person|system, inherits: 別のアクターの id, color }]
    kind: system は外部サービスなど人以外。inherits を書くと「〇〇の全操作に加えて」と表示されます
  cases: [{ id, name（「〜する」の形で全角16文字以内）, actors: [アクターの id], condition, note }]
    最初に書いたアクターの段に並びます。condition（条件）を書くと点線のカードになり、条件がカードに表示されます
  relations: [{ from, to, type: include|extend }]
    include: from が必ず to を含む（例: 予約する → 空き枠を探す）
    extend: from が条件付きで to を拡張する（例: クーポンを使う → 予約する）
  flows: [{ from: 区画の id, to: 区画の id, label, note }]（隣り合う区画の間の受け渡し。例: 帰社後に同期）
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
zones:
  - { id: customer, name: お客さま, note: スマートフォン／会員登録なしで予約 }
  - { id: store, name: 店舗, note: 受付のパソコン }
actors:
  - { id: user, name: 利用者, note: 30代・会社員, zone: customer }
  - { id: staff, name: 店舗スタッフ, note: 受付, zone: store }
  - { id: owner, name: 店長, zone: store, inherits: staff }
  - { id: mail, name: メール配信, note: 外部サービス, zone: store, kind: system }
cases:
  - { id: UC-01, name: 空き枠を探す, actors: [user] }
  - { id: UC-02, name: 予約する, actors: [user] }
  - { id: UC-03, name: 予約を変更・キャンセルする, actors: [user], condition: 予約日の前日まで }
  - { id: UC-04, name: 当日の予約一覧を見る, actors: [staff] }
  - { id: UC-05, name: 来店を記録する, actors: [staff] }
  - { id: UC-06, name: 営業枠とメニューを設定する, actors: [owner] }
  - { id: UC-07, name: 予約完了を通知する, actors: [mail] }
relations:
  - { from: UC-02, to: UC-01, type: include }
  - { from: UC-02, to: UC-07, type: include }
flows:
  - { from: customer, to: store, label: 予約がすぐ店舗に届く, note: 電話の受付が不要になる }
```
