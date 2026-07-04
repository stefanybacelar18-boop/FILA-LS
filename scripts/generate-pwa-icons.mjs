import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const iconSvg = readFileSync(join(root, "public/icons/icon.svg"));

const iconSizes = [
  { name: "icon-24.png", size: 24 },
  { name: "icon-32.png", size: 32 },
  { name: "icon-64.png", size: 64 },
  { name: "icon-128.png", size: 128 },
  { name: "icon-192.png", size: 192 },
  { name: "icon-256.png", size: 256 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

mkdirSync(join(root, "public/icons"), { recursive: true });
mkdirSync(join(root, "public/brand"), { recursive: true });

for (const { name, size } of iconSizes) {
  await sharp(iconSvg, { density: 320 })
    .resize(size, size)
    .png()
    .toFile(join(root, "public/icons", name));
  console.log(`Generated icons/${name}`);
}

await sharp(iconSvg, { density: 320 })
  .resize(32, 32)
  .png()
  .toFile(join(root, "public/favicon.ico"));

await sharp(iconSvg, { density: 320 })
  .resize(512, 512)
  .png()
  .toFile(join(root, "public/brand/logo-symbol-512.png"));

console.log("Generated favicon.ico and brand/logo-symbol-512.png");
