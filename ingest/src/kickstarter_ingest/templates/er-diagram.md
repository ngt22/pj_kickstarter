---
title: ER図
order: 7
---

<!--
```er ブロックに YAML でテーブルを書くと、ズーム・検索・ドメイン絞り込みができる ER 図になります。
  domains: ドメイン（業務のまとまり）。color は Mantine の色名（blue, teal, grape, orange ...）
  tables:  name（物理名） label（論理名） domain note columns
  columns: name type pk fk（"テーブル名" か "テーブル名.列名"） unique（fk と併用で 1対1） nullable note
リレーションは fk から自動で引かれます。100 テーブル程度まで想定しています。
-->

```er
domains:
  - { id: core, name: 基本, color: blue }
  - { id: master, name: マスタ, color: grape }
tables:
  - name: order
    label: 注文
    domain: core
    columns:
      - { name: id, type: string, pk: true }
      - { name: user_id, type: string, fk: user }
      - { name: ordered_at, type: datetime }
  - name: user
    label: ユーザー
    domain: master
    columns:
      - { name: id, type: string, pk: true }
      - { name: name, type: string }
```

## 補足

- 
