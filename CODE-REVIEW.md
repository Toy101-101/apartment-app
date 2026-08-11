# コードレビューの指摘（2026-08-11 / xhigh / 14件）

v2の5機能を入れたあとにかけたレビュー。**修正はまだ1件も着手していない。**
上の3つが実害のあるもの。

## 直したいもの（重い順）

### 1. ⑥ 取り替えで、直した年数が保存されない
`app/src/screens/EquipmentForm.tsx:112`
取り替え画面の「何年もつ見込みか」は書きかえられるのに、`replace()` が `lifeYears` を渡していない。
`replaceEquipment` が必ず前の値をそのまま写すので、入力が黙って捨てられる。

### 2. ⑤ 「済んだことにする」が必ず今日の日付で費用計上
`app/src/screens/Schedules.tsx:41`
`completeSchedule` に `date: today()` を渡していて、実際に払った日を入れる手段がない。
固定費が「ボタンを押した月・年」に載るので、**確定申告の年がずれる**。

### 3. ⑤ 見積り額が実費の欄に最初から入っている
`app/src/screens/Schedules.tsx:32`
`start()` が「かかった金額」に `schedule.amount`（＝だいたいの金額）を初期入力している。
直さずに確定を押すと、見積りがそのまま実費として記録される。

## データの正しさ

### 4. 移行テストが実際には版上げを通っていない
`app/src/db.test.ts:56`
版2→3・版3→4・版4→5 のテストが版1→5 のテストより後に同じファイルで走る。
IndexedDB の状態が残っているため既に version 5 で、db も開いたまま。**版上げが一度も起きていない。**

### 5. 退去の `ensure()` が同時押しで一意制約に当たる
`app/src/lib/moveout.ts:144`
トランザクション外で「読んでから作る」をしている。`moveOuts` は `id, &leaseId`。
同時に2回走ると両方とも「無い」と判断して挿入し、後の方が ConstraintError。どこも受け止めていない。

### 6. 費用を先に書いてから予定を更新している（トランザクション無し）
`app/src/lib/schedules.ts:183`
`completeSchedule` が `createExpense` を先に実行し、そのあと予定を進める／消す。
2つをまたぐトランザクションが無いので、途中で失敗すると費用だけ残って予定が進まない。

### 7. 消した設備・予定が二度と戻せない
`app/src/lib/equipment.ts:177`
`removeEquipment` / `removeSchedule` は `deletedAt` を立てるだけだが、戻す関数が無く、画面も確認を出さない。
「この設備を消す」の押し間違い1回で、利用者から見ると消滅する。

### 8. ホームと年ごとのまとめで `buildYear` に渡すものが違う
`app/src/screens/Home.tsx:42`
ホームは今年の入金だけを渡し、年ごとのまとめは `db.payments.toArray()` を渡す。
同じ関数なのに `firstRecordedMonth` が変わり、各月の「まだ／済み／これから」の判定が両者でずれる。

## 整理したいもの

### 9. `readSettings` 系が使われていない重複
`app/src/lib/settings.ts:43`
`readSettings` / `Settings` / `DEFAULT_SETTINGS` は `settings.test.ts` からしか呼ばれていない。
画面はすべて `readRenewalNoticeDays` を使っていて、同じ meta キーを別経路で読んでいる。

### 10. 「60日前」の既定値が2か所にある
`app/src/lib/rent.ts:74`
`renewalLevel` が `noticeDays = 60` を直書き、`settings.ts` にも `DEFAULT_RENEWAL_NOTICE_DAYS = 60`。
繋がりが無いので片方だけ変わりうる。

### 11. ホームの2つ目の `Promise.all` が無駄な往復
`app/src/screens/Home.tsx:49`
`readRenewalNoticeDays()` と `db.moveOuts.toArray()` を1つ目の解決後に待っているが、依存関係が無い。

### 12. 履歴の計算が画面側にある
`app/src/screens/Equipment.tsx:27`
「取り替えたもの」の部屋名と「何年もった」を画面内で計算していて、
`lib/equipment.ts` の `buildEquipmentRows` が現役リスト用に持っている処理と重複。

### 13. 同じボタンのCSSが4ファイルに複製
`app/src/screens/Schedules.module.css:122`
横幅いっぱい・64px の `.primary` / `.secondary` 一式が Schedules / ScheduleForm / Equipment / EquipmentForm / MoveOut に複写。
`Backup.module.css` に既にあるものと同じ。

### 14. ホームが書き込みのたびに6つの派生を作り直す
`app/src/screens/Home.tsx:33`
`useLiveQuery` が10テーブルを読み、`buildContractRows` / `buildVacancyRows` / `buildScheduleRows` /
`buildEquipmentRows` / `pendingMoveOuts` / `buildYear`（内部で `buildMonthRows` を12回）を実行。
対象テーブルのどれかが変わるたび全部走る。
