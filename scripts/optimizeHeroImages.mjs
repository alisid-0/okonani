import { readdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const heroDir = path.resolve('src/assets/hero')

const files = await readdir(heroDir)

for (const file of files) {
  if (!file.endsWith('.png')) continue

  const input = path.join(heroDir, file)
  const base = file.replace(/\.png$/i, '')
  const isMainHero = base === 'Untitled_Artwork'
  const maxWidth = isMainHero ? 1400 : 720
  const output = path.join(heroDir, `${base}.webp`)

  const info = await sharp(input)
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(output)

  console.log(`${file} -> ${base}.webp (${info.width}x${info.height}, ${info.size} bytes)`)
}
