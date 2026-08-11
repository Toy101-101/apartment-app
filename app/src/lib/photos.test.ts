// IndexedDB はブラウザの機能なので、試験ではその代役を使う（必ず db より先に読み込む）
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db'
import { commitPhotos, fitSize, loadPhotos, removePhotos, type PickedPhoto } from './photos'

/**
 * 写真の試験
 *
 * 実際の縮小（createImageBitmap と canvas）はブラウザの機能なので、ここでは動かせない。
 * 代わりに、まちがえると被害が大きいところを押さえる。
 *   ・大きさの計算（縦横の比が崩れないか）
 *   ・保存と片づけ（外した写真が端末に残り続けないか）
 */

const jpeg = (text: string) => new Blob([text], { type: 'image/jpeg' })
const picked = (text: string): PickedPhoto => ({ blob: jpeg(text), width: 1600, height: 1200 })

describe('小さくする大きさの計算', () => {
  it('横長は横を1600に合わせる', () => {
    expect(fitSize(4032, 3024, 1600)).toStrictEqual({ width: 1600, height: 1200 })
  })

  it('縦長は縦を1600に合わせる（iPhoneの縦写真）', () => {
    expect(fitSize(3024, 4032, 1600)).toStrictEqual({ width: 1200, height: 1600 })
  })

  it('もともと小さい写真は、大きくしない', () => {
    expect(fitSize(800, 600, 1600)).toStrictEqual({ width: 800, height: 600 })
  })

  it('ちょうど1600ならそのまま', () => {
    expect(fitSize(1600, 900, 1600)).toStrictEqual({ width: 1600, height: 900 })
  })

  it('細長い写真でも、0ピクセルにはしない', () => {
    expect(fitSize(8000, 3, 1600).height).toBe(1)
  })

  it('大きさが分からなくても壊れない', () => {
    expect(fitSize(0, 0, 1600)).toStrictEqual({ width: 0, height: 0 })
  })
})

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('保存と片づけ', () => {
  it('新しく選んだ写真が保存され、id が返る', async () => {
    const ids = await commitPhotos([], [picked('1枚目'), picked('2枚目')])
    expect(ids).toHaveLength(2)
    expect(await db.photos.count()).toBe(2)
  })

  it('もう1回保存しても、すでにある写真は増えない', async () => {
    const ids = await commitPhotos([], [picked('1枚目')])
    const saved = await loadPhotos(ids)
    const again = await commitPhotos(ids, saved)

    expect(again).toStrictEqual(ids)
    expect(await db.photos.count()).toBe(1)
  })

  it('画面から外した写真は、端末からも消える', async () => {
    const ids = await commitPhotos([], [picked('残す'), picked('外す')])
    const saved = await loadPhotos(ids)

    const after = await commitPhotos(ids, [saved[0]])
    expect(after).toStrictEqual([ids[0]])
    expect(await db.photos.count()).toBe(1)
  })

  it('外しながら足すこともできる', async () => {
    const ids = await commitPhotos([], [picked('外す')])
    const after = await commitPhotos(ids, [picked('新しい1枚')])
    expect(after).toHaveLength(1)
    expect(after[0]).not.toBe(ids[0])
    expect(await db.photos.count()).toBe(1)
  })

  it('並びは画面で見ていたとおりのまま', async () => {
    const ids = await commitPhotos([], [picked('あ'), picked('い'), picked('う')])
    expect((await loadPhotos(ids)).map((p) => p.id)).toStrictEqual(ids)
  })

  it('記録ごと消すときは、ぶら下がっている写真も片づく', async () => {
    const ids = await commitPhotos([], [picked('あ'), picked('い')])
    await removePhotos(ids)
    expect(await db.photos.count()).toBe(0)
  })

  it('写真が1枚も無くても壊れない', async () => {
    expect(await commitPhotos([], [])).toStrictEqual([])
    await removePhotos([])
    expect(await loadPhotos([])).toStrictEqual([])
  })

  it('消えてしまった写真の id があっても、残りは読める', async () => {
    const ids = await commitPhotos([], [picked('あ')])
    expect(await loadPhotos([...ids, 'いない写真'])).toHaveLength(1)
  })
})
