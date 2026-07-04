import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "public/icons/icon.svg"));

const sizes = [
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

for (const { name, size } of sizes) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(join(root, "public/icons", name));
  console.log(`Generated ${name}`);
}

await sharp(svg, { density: 300 })
  .resize(32, 32)
  .png()
  .toFile(join(root, "public/favicon.ico"));

console.log("Generated favicon.ico");
