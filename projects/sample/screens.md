---
title: 画面仕様 / ワイヤーフレーム
order: 5
---

## SC-01 トップ（空き枠検索）

```mock
device: desktop
title: /
body:
  - header: { title: さくら整体 予約, links: [お知らせ, アクセス], actions: [{ label: ログイン, to: SC-10 }] }
  - heading: 空き枠を探す
  - row:
      - input: { label: 日付, type: date, value: 2026-11-01, note: 1 }
      - select: { label: メニュー, options: [全身整体 60分, 肩こり集中 30分], note: 2 }
  - buttons: [{ label: 検索, variant: primary }]
  - table:
      note: 3
      columns: [時間, 状態, 残り, ""]
      rows:
        - ["10:00", "(空きあり)", 2, "[予約]"]
        - ["11:00", "(満席)", 0, ""]
        - ["13:00", "(空きあり)", 1, "[予約]"]
```

| No | 項目 | 種類 | 備考 |
| --- | --- | --- | --- |
| 1 | 日付 | 日付選択 | 今日から60日先まで |
| 2 | メニュー | 選択 | 初期値は「全身整体 60分」 |
| 3 | 空き枠一覧 | 表 | 「予約」で SC-02 へ遷移。満席の行はボタンなし |

## SC-02 予約入力（スマートフォン）

```mock
device: mobile
body:
  - header: { title: さくら整体 }
  - alert: { title: 11/1（日）10:00 全身整体 60分, text: 選択中の枠です, color: teal }
  - input: { label: 氏名, placeholder: 山田 太郎, required: true, note: 1 }
  - input: { label: メールアドレス, type: email, placeholder: taro@example.com, required: true, note: 2 }
  - select: { label: 人数, options: [1, 2, 3], note: 3 }
  - checkbox: { label: 利用規約に同意する, note: 4 }
  - buttons:
      - { label: 戻る, to: SC-01 }
      - { label: 確認へ, variant: primary, to: SC-03 }
```

| No | 項目 | 種類 | 備考 |
| --- | --- | --- | --- |
| 1 | 氏名 | テキスト | 必須、50文字まで |
| 2 | メールアドレス | メール | 必須、確認メールの送信先 |
| 3 | 人数 | 選択 | 枠の残り数まで |
| 4 | 規約同意 | チェック | 未チェックなら「確認へ」を押せない |
