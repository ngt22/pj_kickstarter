---
title: 技術仕様書
order: 4
---

<!--
システム構成図は ```arch ブロックに YAML で書きます。区画が上から下へ重なり、区画の中にカードが左から右へ並びます。
  zones: [{ id, name, note, color, external }]（例: 利用者の端末 / クラウド / 外部サービス。external: true は点線の枠）
  nodes: [{ id, name: 役割, kind, tech: 技術名, note, zone }]
    kind: user（利用者・丸いピル）/ device / web / app / server / function / db / storage / auth / queue / mail / external / batch
  links: [{ from, to, label, type: sync|async, both }]（async は点線。both: true は両方向の矢印）
  notes: [文字...]（図の下に出す注記）
-->

## システム構成

```arch
zones:
  - { id: client, name: 利用者の端末, note: スマートフォン・パソコンのブラウザ }
  - { id: cloud, name: クラウド, note: Firebase（東京リージョン） }
  - { id: ext, name: 外部サービス, external: true }
nodes:
  - { id: user, name: 利用者, kind: user, zone: client }
  - { id: web, name: Webアプリ, kind: web, tech: React, zone: client }
  - { id: hosting, name: 画面の配信, kind: server, tech: Firebase Hosting, zone: cloud }
  - { id: auth, name: ログイン, kind: auth, tech: Firebase Auth, zone: cloud }
  - { id: db, name: データ, kind: db, tech: Firestore, zone: cloud }
  - { id: mail, name: メール配信, kind: mail, zone: ext }
links:
  - { from: user, to: web }
  - { from: web, to: hosting, label: 画面を読み込む }
  - { from: web, to: auth, label: ログイン }
  - { from: web, to: db, label: データの読み書き }
  - { from: db, to: mail, label: お知らせ, type: async }
```

## 技術スタック

| レイヤ | 採用技術 | 理由 |
| --- | --- | --- |
| フロントエンド | React + Vite | 学習コストが低く高速 |
| 認証 | Firebase Auth | メール/Googleログインを標準提供 |
| データ | Firestore | サーバー管理が不要で、利用状況に応じて拡張できる |

## 決定事項

- 採用理由の詳細は ADR を参照
