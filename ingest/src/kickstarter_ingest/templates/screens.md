---
title: 画面仕様 / ワイヤーフレーム
order: 5
---

<!--
```mock ブロックに YAML で部品を上から並べると、案件カラーの「画面イメージ」として描画されます。
  device: desktop | tablet | mobile（最初に見せる端末。画面の上の切り替えで、ほかの端末でも見られる）   title: アドレスバーに出すパス
  devices: [desktop, tablet, mobile]（切り替えに出す端末。省略時はパソコンとスマホ。タブレットは書いたときだけ出る）
  pwa: true（ブラウザ表示とアプリ（PWA）表示を切り替えられる。PWA ではアドレスバーが消え、パソコンはアプリ名の窓になる）
  display: browser | pwa（最初に見せる表示）   app: PWA の窓に出すアプリ名（省略時は header の title）
  パソコンで見ると tabbar は横のメニューに、スマホで見ると nav は上のチップに、row は縦並びになります
画面の骨組み:
  header {title, links, actions, back, action}（先頭に置くと上のバー。スマホは back: true で戻る矢印）
  nav {brand, items, active}（パソコンの横メニュー）  tabbar {items, active}（スマホの下のタブ）  footer {text, links}
  メニューやタブはアイコンが名前から自動で付きます（ホーム・検索・予約・通知・設定・マイページ など）
部品（「- 種類: 中身」）:
  heading  text  breadcrumb [名前...]  stepper {items, active}  alert {title, text, color}  toast {title, text, tone}
  input {label, type: text|email|date|number|password|textarea, placeholder, value, required, help, error}
  search {placeholder}  select {label, options}  checkbox {label, checked}  radio {label, options}
  button {label, variant: primary|default|danger|link, to: 遷移先の画面ID, full}  buttons [ボタン...]
  row [部品...]（横並び）  card {title, items: [部品...]}  tabs [名前...]
  stats [{label, value, delta}]（数値カード）  list [文字...] または [{title, sub, meta, badge, thumb, avatar, to}]
  table {columns, rows}（セルの "[予約]" はボタン、"(満席)" はバッジ）  pagination {total}  empty {title, hint, action}
  avatar {name, role}  badge {text, color}  image {label, height}  divider  space
  drawing {title, floors, floor, rooms: [部屋名...], pins: [{x, y, label, status: new|prev|done, text}], selected}
    （図面と指摘位置などのピン。図面は部屋名から自動で描き、ピンの x・y は図面に対する %。selected のピンは吹き出しに text を出す）
どの部品にも note: 番号 を付けると画面の外に注釈が並び、下の項目表と対応させられます。
to: に書いた遷移先は画面の下に「画面遷移」として一覧になります。
-->

## SC-01 トップ

```mock
device: desktop
title: /
body:
  - header: { title: サービス名, links: [お知らせ, ヘルプ], actions: [{ label: ログイン, to: SC-10 }] }
  - heading: 見出し
  - row:
      - input: { label: 項目A, note: 1 }
      - select: { label: 項目B, options: [選択肢1, 選択肢2], note: 2 }
  - buttons: [{ label: 実行, variant: primary, to: SC-02 }]
```

| No | 項目 | 種類 | 備考 |
| --- | --- | --- | --- |
| 1 | 項目A | テキスト | |
| 2 | 項目B | 選択 | |

## SC-02 入力

```mock
device: mobile
body:
  - header: { title: 入力, back: true }
  - input: { label: 氏名, required: true }
  - list:
      - { title: 項目の名前, sub: 補足の説明, thumb: true }
  - buttons: [{ label: 戻る, to: SC-01 }, { label: 次へ, variant: primary }]
  - tabbar: { items: [ホーム, 検索, マイページ], active: ホーム }
```
