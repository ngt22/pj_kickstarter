---
title: ページ遷移図
---

<!--
ページ遷移図は ```flow ブロックに YAML で書きます。区画 → レーンの中に画面のカードが左から右へ並びます。
  zones: [{ id, name, note, color, footnote, lanes: [{ id, name, note }] }]
    区画は使う場所・端末で分けます（例: 現地 / 事務所、お客さま / 店舗）。lanes を書くと区画の中を横に分けます
    （例: 日常業務 / 設定）。lane の note はカードの右に、footnote は区画の下に小さく出ます
  screens: [{ id: 画面ID（画面仕様の ## SC-xx と同じ）, name, zone, lane }]（アイコンは画面名から自動で付きます）
  terminals: [{ id, label, zone, lane }]（開始・提出などの丸）
  edges: [{ from, to, label, type: go|back|sync }]（同じレーンの中だけ。back は確定・キャンセルで戻る線、sync はデータの同期の太い点線）
  thumbnails: false（画面のカードに、画面仕様の ```mock の縮小を出さない。既定では ## SC-xx の画面イメージが自動で載り、クリックで画面仕様へ移動）
  flows: [{ from: 区画の id, to: 区画の id, label, note }]（隣り合う区画の間の受け渡し。例: 帰社後に同期）
  notes: [文字...]（図の下に出す注記。例: 各画面のヘッダーから一覧に戻れるため戻り線は省略）
-->

```flow
zones:
  - id: customer
    name: お客さま
    note: スマートフォン・パソコン／会員登録なしで予約
  - id: store
    name: 店舗
    note: 受付のパソコン
    lanes:
      - { id: daily, name: 日常業務 }
      - { id: settings, name: 設定（店長）, note: 予約画面に出す営業枠とメニューの元データ。日々の業務とは独立した設定画面 }
    footnote: SC-05〜SC-09 は将来の拡張用に空けています
screens:
  - { id: SC-01, name: 空き枠検索, zone: customer }
  - { id: SC-02, name: 予約入力, zone: customer }
  - { id: SC-03, name: 予約内容の確認, zone: customer }
  - { id: SC-04, name: 予約完了, zone: customer }
  - { id: SC-10, name: 管理ログイン, zone: store, lane: daily }
  - { id: SC-11, name: 予約一覧, zone: store, lane: daily }
  - { id: SC-12, name: 来店記録, zone: store, lane: daily }
  - { id: SC-13, name: 営業枠・メニュー設定, zone: store, lane: settings }
terminals:
  - { id: start, label: 開始, zone: customer }
  - { id: visit, label: 来店, zone: store, lane: daily }
edges:
  - { from: start, to: SC-01 }
  - { from: SC-01, to: SC-02, label: 枠を選ぶ }
  - { from: SC-02, to: SC-03, label: 確認へ }
  - { from: SC-03, to: SC-04, label: 予約する }
  - { from: SC-03, to: SC-02, label: 修正する, type: back }
  - { from: SC-10, to: SC-11, label: ログイン }
  - { from: SC-11, to: SC-12, label: 来店時 }
  - { from: SC-12, to: visit }
flows:
  - { from: customer, to: store, label: 予約がすぐ店舗に届く, note: 予約一覧（SC-11）に表示される }
notes:
  - 各画面のヘッダーからトップ（SC-01）に戻れるため、戻り線は省略しています
```
