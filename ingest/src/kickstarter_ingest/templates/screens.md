---
title: 画面仕様 / ワイヤーフレーム
order: 5
---

<!--
```mock ブロックに YAML で部品を上から並べると、画面モックとして描画されます。
  device: desktop | mobile（枠の形）   title: アドレスバーに出す文字
部品（「- 種類: 中身」）:
  header {title, links, actions}  heading  text  alert {title, text, color}
  input {label, type: text|email|date|number|password|textarea, placeholder, value, required, help, error}
  select {label, options}  checkbox {label, checked}  radio {label, options}
  button {label, variant: primary|default|danger|link, to: 遷移先}  buttons [ボタン...]
  row [部品...]（横並び）  card {title, items: [部品...]}  tabs [名前...]  list [文字...]
  table {columns, rows}（セルの "[予約]" はボタン、"(満席)" はバッジ）  image {label, height}  divider  space
どの部品にも note: 番号 を付けると赤い丸番号が付き、下の項目表と対応させられます。
-->

## SC-01 トップ

```mock
device: desktop
title: /
body:
  - header: { title: サービス名, actions: [{ label: ログイン, to: SC-10 }] }
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
  - header: { title: サービス名 }
  - input: { label: 氏名, required: true }
  - buttons: [{ label: 戻る, to: SC-01 }, { label: 次へ, variant: primary }]
```
