---
title: ER図
order: 7
---

```er
domains:
  - { id: booking, name: 予約, color: blue }
  - { id: customer, name: 顧客, color: teal }
  - { id: master, name: マスタ, color: grape }
tables:
  - name: reservation
    label: 予約
    domain: booking
    columns:
      - { name: id, type: string, pk: true }
      - { name: slot_id, type: string, fk: slot }
      - { name: customer_id, type: string, fk: customer }
      - { name: people, type: int }
      - { name: status, type: string, note: confirmed / canceled }
      - { name: created_at, type: datetime }
  - name: reservation_history
    label: 予約履歴
    domain: booking
    columns:
      - { name: id, type: string, pk: true }
      - { name: reservation_id, type: string, fk: reservation }
      - { name: status, type: string }
      - { name: changed_at, type: datetime }
  - name: slot
    label: 予約枠
    domain: booking
    columns:
      - { name: id, type: string, pk: true }
      - { name: menu_id, type: string, fk: menu }
      - { name: staff_id, type: string, fk: staff, nullable: true }
      - { name: start_at, type: datetime }
      - { name: capacity, type: int }
  - name: customer
    label: 顧客
    domain: customer
    columns:
      - { name: id, type: string, pk: true }
      - { name: name, type: string }
      - { name: email, type: string }
  - name: customer_profile
    label: 顧客プロフィール
    domain: customer
    columns:
      - { name: customer_id, type: string, pk: true, fk: customer, unique: true }
      - { name: phone, type: string, nullable: true }
      - { name: birthday, type: date, nullable: true }
  - name: menu
    label: メニュー
    domain: master
    columns:
      - { name: id, type: string, pk: true }
      - { name: name, type: string }
      - { name: minutes, type: int }
      - { name: price, type: int }
  - name: staff
    label: スタッフ
    domain: master
    columns:
      - { name: id, type: string, pk: true }
      - { name: name, type: string }
```

## 補足

- reservation.status は `confirmed` / `canceled`
- 列の `?` は NULL を許す列。線の端は鳥の足記法（|| が1、<| が多、○ が0を含む）
