/**
 * 版1（schemaVersion: 1）の控え — 固定ファイル
 *
 * このアプリがまだ meta の表しか持っていなかった頃の形。
 * **この中身は絶対に書き換えないこと。** 書き換えたら「古い控えが読めるか」を
 * 確かめる意味が無くなる。版が上がるたびに `backup-v2.ts` のように足していく。
 *
 * JSONの文字列そのままで持つ（オブジェクトで持つと、型を直したときに
 * つられて直ってしまい、古いファイルを読む試験にならない）。
 */
export const BACKUP_V1_JSON = `{
  "format": "apartment-app-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-08-10T02:15:00.000Z",
  "counts": { "meta": 3 },
  "data": {
    "meta": [
      { "key": "checkCount", "value": "4", "updatedAt": "2026-08-10T02:14:31.000Z" },
      { "key": "lastCheckAt", "value": "2026/8/10 11:14:31", "updatedAt": "2026-08-10T02:14:31.000Z" },
      { "key": "schemaVersion", "value": "1", "updatedAt": "2026-08-10T02:14:31.000Z" }
    ]
  }
}
`
