import { db, newId, now, type Photo } from '../db'

/**
 * 写真
 *
 * スマホの写真はそのままだと1枚5MB前後ある。10枚も付ければ端末が重くなるので、
 * **保存する前に必ず小さくする**（長辺1600px・JPEG品質0.8 → 1枚200〜400KB）。
 *
 * iPhoneで撮った縦の写真は、そのまま canvas に描くと横倒しになる。
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` を通すと向きが直り、
 * HEIC も JPEG になる。ここを通さない道を作らないこと。
 */

/** 長辺を maxEdge に収める大きさ（縦横の比は変えない。もともと小さければそのまま） */
export function fitSize(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest === 0) return { width, height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** 画面に出す前の、まだ保存していない写真 */
export interface PickedPhoto {
  /** すでに保存されている写真なら id が入っている */
  id?: string
  blob: Blob
  width: number
  height: number
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('写真を小さくできませんでした。'))),
      'image/jpeg',
      quality,
    )
  })
}

/** 撮った写真を、向きを直してから小さくする */
export async function compressImage(
  file: Blob,
  maxEdge = 1600,
  quality = 0.8,
): Promise<PickedPhoto> {
  // ここで向き（EXIF）を解決する。iPhoneの縦写真が横倒しにならないのはこの一行のおかげ
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const size = fitSize(bitmap.width, bitmap.height, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('写真を扱えませんでした。')
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    return { blob: await toBlob(canvas, quality), ...size }
  } finally {
    bitmap.close()
  }
}

/** 保存してある写真を読み出す（並びは渡した id の順のまま） */
export async function loadPhotos(ids: string[]): Promise<PickedPhoto[]> {
  const rows = await db.photos.bulkGet(ids)
  return rows
    .filter((r): r is Photo => !!r)
    .map((r) => ({ id: r.id, blob: r.blob, width: r.width, height: r.height }))
}

/**
 * 画面で選んだ写真を保存し、記録につける id の一覧を返す。
 * 画面から外された写真は、ここで端末からも消す（残しても誰も見られないため）。
 */
export async function commitPhotos(before: string[], picked: PickedPhoto[]): Promise<string[]> {
  const kept = new Set(picked.map((p) => p.id).filter(Boolean) as string[])
  const at = now()

  const ids: string[] = []
  for (const photo of picked) {
    if (photo.id) {
      ids.push(photo.id)
      continue
    }
    const id = newId()
    await db.photos.put({
      id, createdAt: at, updatedAt: at,
      blob: photo.blob, mime: 'image/jpeg',
      width: photo.width, height: photo.height,
    })
    ids.push(id)
  }

  const removed = before.filter((id) => !kept.has(id))
  if (removed.length > 0) await db.photos.bulkDelete(removed)

  return ids
}

/** 記録ごと消すときに、ぶら下がっている写真も片づける */
export async function removePhotos(ids: string[]): Promise<void> {
  if (ids.length > 0) await db.photos.bulkDelete(ids)
}
