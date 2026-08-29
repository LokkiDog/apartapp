import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const CARD_PREVIEW_SUFFIX = '.card-v1.webp'

export interface FileStorage {
  put(key: string, content: Uint8Array): Promise<void>
  get(key: string): Promise<Buffer>
  remove(key: string): Promise<void>
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly root = process.env.FILE_STORAGE_PATH || '.data/uploads') {}

  async put(key: string, content: Uint8Array) {
    const target = join(this.root, key)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  async get(key: string) { return readFile(join(this.root, key)) }
  async remove(key: string) {
    for (const storageKey of [key, `${key}${CARD_PREVIEW_SUFFIX}`]) {
      try { await unlink(join(this.root, storageKey)) }
      catch (error: any) {
        if (error?.code !== 'ENOENT') throw error
      }
    }
  }
}

export const fileStorage = new LocalFileStorage()
