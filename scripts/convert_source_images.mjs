#!/usr/bin/env node
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const numbers = process.argv.slice(2).map(Number);
const seasons = numbers.length ? numbers : [5, 6, 7, 8, 9, 10];
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
let converted = 0;
let existing = 0;

async function decoded(file) {
  return sharp(file).raw().toBuffer({ resolveWithObject: true });
}

for (const season of seasons) {
  if (!Number.isInteger(season) || season < 1) throw new Error('Numéro de saison invalide');
  const dir = path.join(sourceRoot, `SAISON ${season}`);
  const files = (await readdir(dir, { recursive: true })).sort();
  for (const relative of files) {
    if (!/\.(tif|tiff|till)$/i.test(relative)) continue;
    const source = path.join(dir, relative);
    if (!(await stat(source)).isFile()) continue;
    const meta = await sharp(source).metadata();
    if (!['tiff', 'jpeg', 'png'].includes(meta.format) || (meta.pages ?? 1) !== 1 || meta.depth !== 'uchar') {
      throw new Error(`Image non prise en charge sans perte : ${source}`);
    }
    const target = source.replace(/\.(tif|tiff|till)$/i, '.png');
    const original = await decoded(source);
    let alreadyExists = false;
    try { await stat(target); alreadyExists = true; } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const temporary = `${target}.tmp`;
    try {
      if (!alreadyExists) {
        await sharp(source).keepMetadata().png({ compressionLevel: 9 }).toFile(temporary);
      }
      const result = await decoded(alreadyExists ? target : temporary);
      if (original.info.width !== result.info.width || original.info.height !== result.info.height ||
          original.info.channels !== result.info.channels || hash(original.data) !== hash(result.data)) {
        throw new Error(`Les pixels PNG diffèrent du TIFF : ${source}`);
      }
      if (alreadyExists) existing++;
      else {
        await rename(temporary, target);
        converted++;
      }
      console.log(`S${season} : ${path.relative(dir, target)} — pixels vérifiés`);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
console.log(`${converted} fichiers convertis en PNG, ${existing} PNG existants vérifiés. Originaux conservés.`);
