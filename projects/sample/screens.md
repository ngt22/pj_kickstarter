---
title: 画面仕様 / ワイヤーフレーム
---

## SC-01 トップ（空き枠検索）

```mock
device: desktop
title: /
body:
  - header: { title: さくら整体 予約, links: [お知らせ, メニュー, アクセス], actions: [{ label: ログイン, to: SC-10 }] }
  - breadcrumb: [ホーム, 空き枠を探す]
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
  - header: { title: 予約内容の入力, back: true }
  - stepper: { items: [日時, 入力, 確認], active: 2 }
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

## SC-04 予約完了（スマートフォン）

```mock
device: mobile
body:
  - header: { title: 予約 }
  - toast: { title: 予約を受け付けました, text: 確認メールをお送りしました, note: 1 }
  - heading: { text: これからの予約, level: 4 }
  - list:
      note: 2
      items:
        - { title: 全身整体 60分, sub: 11/1（日）10:00〜, badge: 確定, thumb: true }
        - { title: 肩こり集中 30分, sub: 11/15（日）13:00〜, badge: 確定, thumb: true }
  - button: { label: 別の日時を予約する, full: true, to: SC-01, note: 3 }
  - tabbar: { items: [ホーム, 予約, お知らせ, マイページ], active: 予約 }
```

| No | 項目 | 種類 | 備考 |
| --- | --- | --- | --- |
| 1 | 完了メッセージ | 通知 | 予約直後のみ表示し、5秒で消える |
| 2 | 予約一覧 | リスト | 日時の近い順。タップで予約詳細 |
| 3 | 別の日時を予約する | ボタン | SC-01 へ |

## SC-11 予約一覧（管理）

```mock
device: desktop
title: /admin/reservations
body:
  - header: { title: さくら整体 管理, actions: [{ label: ログアウト }] }
  - nav: { items: [ダッシュボード, 予約一覧, 顧客, 設定], active: 予約一覧, note: 1 }
  - heading: 予約一覧
  - stats:
      note: 2
      items:
        - { label: 本日の予約, value: 8件, delta: +2 }
        - { label: 今週の予約, value: 41件, delta: +5 }
        - { label: キャンセル, value: 1件, delta: -1 }
  - row:
      - search: { placeholder: 氏名・電話番号で検索, note: 3 }
      - select: { label: "", options: [すべての状態, 確定, キャンセル] }
  - table:
      note: 4
      columns: [日時, 氏名, メニュー, 状態, ""]
      rows:
        - ["11/1 10:00", 山田 太郎, 全身整体 60分, "(確定)", "[詳細]"]
        - ["11/1 11:00", 佐藤 花子, 肩こり集中 30分, "(確定)", "[詳細]"]
        - ["11/1 13:00", 鈴木 一郎, 全身整体 60分, "(キャンセル)", "[詳細]"]
  - pagination: { total: 5 }
```

| No | 項目 | 種類 | 備考 |
| --- | --- | --- | --- |
| 1 | メニュー | ナビゲーション | スタッフ権限のみ表示 |
| 2 | 件数サマリー | 数値 | 前週比を表示 |
| 3 | 検索 | テキスト | 氏名・電話番号の部分一致 |
| 4 | 予約一覧 | 表 | 20件ずつ表示。「詳細」で予約詳細へ |
