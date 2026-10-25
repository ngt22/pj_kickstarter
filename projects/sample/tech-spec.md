---
title: 技術仕様書
order: 4
---

## システム構成

```arch
zones:
  - { id: client, name: 利用者の端末, note: スマートフォン・パソコンのブラウザ }
  - { id: cloud, name: クラウド, note: Firebase（東京リージョン） }
  - { id: ext, name: 外部サービス, external: true }
nodes:
  - { id: customer, name: お客さま, kind: user, zone: client }
  - { id: staff, name: 店舗スタッフ, kind: user, zone: client }
  - { id: web, name: 予約サイト, kind: web, tech: React, zone: client, note: スマホ・PC 共通の画面 }
  - { id: hosting, name: 画面の配信, kind: server, tech: Firebase Hosting, zone: cloud }
  - { id: auth, name: ログイン, kind: auth, tech: Firebase Auth, zone: cloud, note: 店舗スタッフのみ }
  - { id: db, name: 予約データ, kind: db, tech: Firestore, zone: cloud }
  - { id: fn, name: 予約の通知, kind: function, tech: Cloud Functions, zone: cloud }
  - { id: mail, name: メール配信, kind: mail, tech: SendGrid, zone: ext }
links:
  - { from: customer, to: web }
  - { from: staff, to: web }
  - { from: web, to: hosting, label: 画面を読み込む }
  - { from: web, to: auth, label: ログイン }
  - { from: web, to: db, label: 予約の読み書き }
  - { from: db, to: fn, label: 予約が入ったら, type: async }
  - { from: fn, to: mail, label: 確認メール, type: async }
notes:
  - 決済は店頭で行うため、決済サービスとは連携しません
```

## 技術スタック

| レイヤ | 採用技術 | 理由 |
| --- | --- | --- |
| フロントエンド | React + Vite | 学習コストが低く高速 |
| 認証 | Firebase Auth | メール/Googleログインを標準提供 |
| データ | Firestore | サーバー管理が不要で、利用状況に応じて拡張できる |

## 決定事項

- 採用理由の詳細は ADR を参照
