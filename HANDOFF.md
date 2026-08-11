# 引き継ぎメモ（現在地）

最終更新: 2026-08-11 / フェーズ5 完了時点

このファイルは「**いま何がどこまでできていて、次に何をするか**」だけを書く。
なぜそう作るのかは `PLAN.md`、決めごとは `README.md` を見ること。

---

## 1. 現在地

**フェーズ5（④空室の状況）まで完了。①〜④の中身がすべて揃った。残るはフェーズ6（共有・印刷・仕上げ）だけ。**

- 公開URL: <https://Toy101-101.github.io/apartment-app/>
- リポジトリ: <https://github.com/Toy101-101/apartment-app>（**公開**リポジトリ）
- フェーズ0: 画面描画・PWA設定・サービスワーカー稼働・オフライン保存・端末内保存（IndexedDB）
- フェーズ1: `db.ts` を `version(2)` にして本体10表。すべて `id`（UUID）で結び、**部屋番号は鍵にしていない**。
  控えの書き出し・読み込み（`lib/backup.ts`）も作ったが、**画面からは外してある**（→ 第2節）
- フェーズ2: **②家賃の入金**
  - `screens/Payments.tsx` — 月ごとの一覧／済・未を1タップ切替／入金日／**取り消し5秒**／
    去年（12か月前）まで遡れる月送り／最近の操作
  - `lib/rent.ts` — 計算だけの置き場（その月の家賃・空室判定・まとめ）
  - `lib/payments.ts` — 済／未の切替と `paymentLog` への記録、取り消し
- フェーズ3: **①入居者・契約**
  - `screens/Contracts.tsx` — 一覧（更新が近い順／終わった契約は下）
  - `screens/ContractDetail.tsx` — 詳細。**連絡のしかた**を目立つ枠で出す。家賃の履歴、いきさつメモ、
    手を入れる操作4つ（書きまちがいを直す／家賃を変える／契約を更新する／退去にする）
  - `screens/ContractForm.tsx` — 登録と書きかえ。**部屋番号を入れれば部屋も一緒に作る**（部屋だけの画面は作らない）
  - `lib/contracts.ts` — 上のすべての土台。**上書きしない**決まりごとはここに集約
  - `components/Screen.tsx` `components/Field.tsx` — 画面の外枠と入力欄（3画面で共通）
  - ホーム — 未入金に加えて**更新が近い契約**も出す。①②のタイルが押せる
- フェーズ4: **③修繕・費用 ＋ 音声入力 ＋ 写真**
  - `screens/Expenses.tsx` — 一覧（すべて／修繕／固定費のタブ、合計つき）
  - `screens/ExpenseDetail.tsx` — 詳細。**「なぜ、この対応をしたか」を金額より先に、いちばん大きく**置く
  - `screens/ExpenseForm.tsx` — 記録。日付・場所・種類はボタンを押すだけ
  - `components/VoiceMemo.tsx` ＋ `lib/speech.ts` — 🎤押して話す。**契約のいきさつメモにも入れてある**
  - `components/PhotoPicker.tsx` ＋ `lib/photos.ts` — 向きを直して長辺1600px・品質0.8に圧縮してから保存
  - ホーム — ③のタイルが押せる（件数つき）
- フェーズ5: **④空室の状況**
  - `screens/Vacancy.tsx` — 部屋のタイル一覧（入居中／空室／退去予定）と、それぞれの室数
  - `lib/vacancy.ts` — **契約から毎回そのつど導き出す。`status` の欄は持たない**
  - ホーム — ④のタイルに「空室◯室」／「すべて入居中」
- テスト: **179件**が手元で合格
  （`date` 20／`backup` 20／`rent` 22／`contracts` 35／`payments` 13／`expenses` 18／
  　`photos` 15／`vacancy` 17／`speech` 7／`sample` 12／`db` 2）

**まだ無いもの**: 控えの画面と印刷（フェーズ6）。①〜④の入口はすべて押せる。

---

## 2. 決まっていること（蒸し返さない）

| 項目 | 決定 |
|---|---|
| 目的 | 家賃計算の効率化ではなく、**判断の経緯ごと家族へ引き継ぐアーカイブ** |
| 主端末 | スマホ（PCでも見られる） |
| 規模 | 1棟8〜10部屋。棟の切替は作らない |
| デザイン | **A案の構造 ＋ C案の寸法・コントラスト ＋ B案の言葉づかい** |
| 言葉づかい | 入金は「済／未」、日付は「令和8年8月10日（月）」、バックアップは「控えを家族に送る」 |
| 公開方法 | GitHub Pages（**公開リポジトリ**。プライベートはPro有料のため不採用） |
| 費用 | **月0円**。ストア登録もサーバーも使わない |
| ログイン | 作らない |
| v1のスコープ | **①〜④すべて ＋ 音声入力 ＋ 写真添付** |

### 前提の変更（重要・以前の版と違う）

**祖父はスマホを普通に使える。** 当初の「デジタル機器に不慣れ」という前提は取り下げ済み。
これに伴い次を**撤回済み**なので、復活させないこと。

- 初回は②家賃の入金だけに絞る → **①〜④を作る**
- 開発初日を聞き取りの日にする → **廃止**
- 振込の「通帳未確認」を第3の状態にする → **廃止（済／未の2状態）**
- 取り消しの表示8秒 → **一般的な5秒**

判読性の基準（17px以上・タップ64px以上・`:active`と`:focus-visible`必須）は**前提と無関係に維持する**。

### 「控えを家族に送る」は画面から外した（2026-08-11・ユーザー判断）

フェーズ1で作った控えの機能は、**ホーム画面から取り外した**。理由は本人の判断によるもので、
蒸し返さないこと。ただし次のとおり、**コードは消していない**。

- `app/src/lib/backup.ts` と `backup.test.ts`、`fixtures/backup-v1.ts` はそのまま残してある
- どの画面からも呼んでいないが、テストは動き続けるので、腐らない
- フェーズ6「共有・印刷」で復活させるときは、画面をつなぐだけでよい
- **`db.ts` の版を上げたら `backup.ts` の `MIGRATIONS` にも手当てを足す**（画面に無くても、ここは生かしておく）

---

## 3. ファイルの場所

```
F:\apartment-app\
  PLAN.md            開発計画（なぜそう作るか）
  HANDOFF.md         このファイル（いまどこか）
  README.md          決めごと・開発コマンド
  app\               アプリ本体
    src\lib\date.ts        日付と金額（令和表記・UTCずれ対策）＋ date.test.ts
    src\lib\rent.ts        家賃の計算だけ（DBに触らない）＋ rent.test.ts
    src\lib\payments.ts    済／未の切替・履歴・取り消し ＋ payments.test.ts
    src\lib\contracts.ts   契約の登録・更新・退去・メモ ＋ contracts.test.ts
    src\lib\expenses.ts    修繕・費用 ＋ expenses.test.ts
    src\lib\photos.ts      写真の圧縮と保存 ＋ photos.test.ts
    src\lib\speech.ts      音声入力 ＋ speech.test.ts
    src\lib\vacancy.ts     空室の導出（入力を持たない）＋ vacancy.test.ts
    src\lib\sample.ts      架空の見本データ ＋ sample.test.ts（入れるボタンは画面から外した）
    src\lib\backup.ts      控えの書き出し・読み込み ＋ backup.test.ts（いまは画面から呼んでいない）
    src\lib\fixtures\      古い版の控え（固定ファイル。書き換え禁止）
    src\db.ts              Dexie。version(2) で本体10表 ＋ db.test.ts（版上げ・時刻の試験）
    src\components\         Screen（外枠）／Field（入力欄）／VoiceMemo（音声）／PhotoPicker（写真）
    src\screens\Home.tsx            ホーム画面
    src\screens\Payments.tsx        ② 家賃の入金
    src\screens\Contracts.tsx       ① 一覧
    src\screens\ContractDetail.tsx  ① 詳細（家賃の履歴・いきさつメモ・手を入れる操作）
    src\screens\ContractForm.tsx    ① 登録と書きかえ
    src\screens\Expenses.tsx        ③ 一覧
    src\screens\ExpenseDetail.tsx   ③ 詳細（なぜそうしたか・写真）
    src\screens\ExpenseForm.tsx     ③ 記録と書きかえ（音声・写真つき）
    src\screens\Vacancy.tsx         ④ 空室の状況
    src\styles\tokens.css  デザイントークン
    vite.config.ts         base と PWA の設定
    public\                アイコン5種（_tmp\make-icons.mjs で生成）
  design\            デザイン3案と比較（compare.html）
  mockup.html        最初の画面見本（JSで描画。全8画面）
  preview-all.html   JS不要の全画面一覧（9画面）
  _tmp\              一時ファイル（Gitに入れない）
```

---

## 4. この環境の注意点（つまずいた実績あり）

- **`F:\Claude` は書き込み禁止**（Nodeの配置先）。プロジェクトは `F:\apartment-app` に置く
- **Cドライブにファイルを作らない**（ユーザーの明確な指示）。一時ファイルも `F:\apartment-app\_tmp\` に置く
- 実行ファイルはフルパスで呼ぶ: `F:\Claude\node.exe` / `F:\Claude\npm.cmd` / `F:\Claude\Git\cmd\git.exe`
- PowerShell 5.1 のため **`&&` は使えない**。`;` と `if ($?)` を使う
- **対話プロンプトが出せない環境**。`git push` の**初回認証だけ**は失敗するため、ユーザー本人にPowerShellで実行してもらった
  → **認証は保存済みで、2回目以降はこちらから直接 push できることを確認済み**（2026-08-10）。ログインを求められるのは、認証情報が消えたときだけ
- `git push` の進捗表示は標準エラー出力に出るため、PowerShellが赤字の `NativeCommandError` を出すことがある。**最終行に `main -> main` があれば成功**
- ブラウザ機能で `localhost` と一部の外部サイトは開けない。**GitHub Pages のURLは開ける**（確認済み）
- PowerShellの画面表示は日本語が文字化けするが、**ファイルの中身は正しいUTF-8**。慌てないこと

---

## 5. 技術上の落とし穴（先に手を打ってある／これから当たる）

**対処済み**
- `vite.config.ts` の `base: '/apartment-app/'`（無いと真っ白になる）
- **HashRouter**（BrowserRouterだと直接URLで404）
- 日付は `'YYYY-MM-DD'` 文字列で持ち、`parseDate()` で分解する。`new Date('2026-08-25')` はUTC解釈で**日本時間だと1日ずれる**
- コミットの作者メールは **GitHubの非公開用アドレス**（`315319109+Toy101-101@users.noreply.github.com`）。公開リポジトリに実アドレスを残さないため

**対処済み（フェーズ1・2で追加）**
- File System Access API は **iOS Safariで動かない** → `navigator.canShare({files})` を見て共有シート、だめならダウンロード（`backup.ts`。いまは画面から呼んでいない）
- 控えJSONに **`schemaVersion` を必ず入れる** → `backup.ts` の `MIGRATIONS` で1段ずつ形を直して読む。
  **一度書いた移行手順は絶対に消さない**（消すとその版の古い控えが二度と読めなくなる）
- 写真（Blob）は控えJSONに入れない → 枚数（`photoCount`）だけ書き、控えを読み込んでも端末の写真は消さない
- **同じミリ秒に2回記録すると履歴の前後が入れかわる** → `db.ts` の `now()` が必ず前より後の時刻を返すようにした。
  時刻を自前で作らず、記録は必ず `now()` を通すこと
- 家賃は上書きしない。その月の額は `rentTerms` から「適用開始年月がその月以前で、いちばん新しい行」を選ぶ（`rentTermFor`）
- **`{ phone: undefined }` のまま保存すると、控えJSONにしたときだけ鍵が消えて中身がずれる**
  → 保存の前に `db.ts` の `compact()` を通し、空の欄は鍵ごと落とす
- 見本データを「入れる」ボタンは画面から外した（本物の記録がある端末で押されると全部消えるため）。
  `removeSample()` は id が `r-101` 形式のものだけを消すので、本物（UUID）とはぶつからない
- **まだ始まっていない契約**（更新して作った次の契約）は「今月の家賃」が無いので、
  始まる月の額を出す。そうしないと一覧に ¥0 と出る（`buildContractRows`）
- 契約の状態は3つ以上ある。**退去が決まっている／これから始まる／続いている／終わった**を
  取りちがえると、「8月31日まで」と「あと50日で契約更新」が並ぶような矛盾が出る（`renewalText`）

**対処済み（フェーズ4で追加）**
- 音声認識はネット接続が必要 → 電波が無いときはボタンを無効にし「文字で書く」に誘導（`VoiceMemo`）
- iOS Safariは1分ほどで自動終了 → `onend` で黙って再開する（`lib/speech.ts`）
- 非対応ブラウザでは**ボタン自体を出さない**（押せないボタンは故障に見える）。
  その場合もキーボードのマイクは使えるので、欄はいつも広く取ってある
- 認識した言葉は**必ず編集できる文字として欄に入る**。自動で保存・確定しない
- iPhoneの縦写真が横倒しになる → `createImageBitmap(file, {imageOrientation:'from-image'})` を必ず通す。
  ここを通さない道を作らないこと（`lib/photos.ts` の `compressImage` だけが入口）
- 写真は長辺1600px・JPEG品質0.8に圧縮してから保存（1枚200〜400KB）
- **`capture="environment"` は付けていない**。付けるとiPhoneでカメラしか開けなくなり、
  先に撮っておいた写真を選べなくなるため（PLAN.mdの記述から意図的に外した）
- 選んだ写真は「保存」を押すまで端末に書かない → 途中でやめた写真がゴミとして残らない
- `URL.createObjectURL` は画面を離れるとき必ず `revokeObjectURL`（解放しないとメモリを食い続ける）

**対処済み（フェーズ5で追加）**
- **空室の判定は月ではなく日で見る**（`isActiveOn`）。月だけで見ると、8月5日に退去した部屋を
  8月11日に「まだ入居中」と出してしまう。②家賃の入金は月単位（`isActiveIn`）でよいので、2つある
- ④は入力を持たない。契約を直せば空室表示も自動でついてくる

**これから当たる**
- **iOSはホーム画面のアイコンを消すとデータも消える** → 控えの画面はフェーズ6。それまでは実データを入れすぎない
- 写真が増えると控えの共有が重くなる → JSONと写真を分けて `navigator.share({files})` に渡す

---

## 6. 次にやること（フェーズ6・3〜4日分／最後）

**共有・印刷・仕上げ。** 作る機能はもう無い。**残した記録を、家族が受け取れる形にする**のが最後の仕事。

1. **控えの画面** — `lib/backup.ts` に関数は全部ある（`createBackup` / `toJson` / `shareBackup` /
   `parseBackup` / `importBackupJson`）。画面をつなぐだけ
   - 書き出し（家族に送る）と、読み込み（別の端末で開く）。最終送信日を出す
   - **フェーズ1で作ったあと、ユーザー判断で画面から外した経緯がある**（→ 第2節）。
     いま戻すかどうかは、必ず本人に確認してから決めること
2. **写真もいっしょに送る** — `navigator.share({ files: [控えJSON, ...写真] })`。
   写真はJSONに入れない決まりなので、ファイルとして並べて渡す
3. **印刷（読める1枚）** — 入居者・家賃・連絡先・保証人を1枚に。`@media print` で作る。
   紙で持っておきたい、という需要がいちばん強いのはここ
4. **仕上げ** — 実機で幅375px・文字サイズ最大、機内モードで起動、
   1年ぶんくらいデータを入れても重くならないか

**フェーズ6が終わったら v1 完成。** そのあとは `PLAN.md`「後で足す（v2以降）」を見ること。
とくに「**この建物のあゆみ（年表）**」は、記録が積み上がって見える形なので、
アーカイブという目的にいちばん近い。

**フェーズ6でやる控えまわり**
- 控えの書き出し・読み込みの**画面**（関数は `lib/backup.ts` にもうある）
- 写真をJSONと一緒に送る（`navigator.share({ files: [json, ...photos] })`）
- 読める1枚（印刷用）

---

## 7. 再開したら最初にすること

```
cd F:\apartment-app\app
F:\Claude\npm.cmd install     （node_modules が無い場合のみ）
F:\Claude\npm.cmd run test    （179件通ることを確認）
F:\Claude\npm.cmd run dev     （http://localhost:5173/apartment-app/ で開く）
```

送信は `main` に push するだけで、GitHub Actions が自動でテスト→ビルド→公開まで行う。

---

## 8. ユーザーについて

- アプリ開発は専門外。**専門用語は避け、手順は「誰が何をするか」を分けて書く**
- GitHubの操作は今回が初めて（アカウントは2026-08-10に作成）
- 判断は速く明確。方向転換の指示も出るので、**前提が変わったら過去の決定を素直に捨てる**
- 実機での確認は本人が行う。こちらは「何を確かめてほしいか」を3つ程度に絞って渡すこと
