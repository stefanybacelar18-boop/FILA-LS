import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const fullLogoPath = join(root, "public/brand/logo-full.png");

/** Recorte do ícone no PNG oficial 1024×1024 — só o quadrado azul, sem texto nem fundo externo. */
const ICON_CROP = { left: 238, top: 82, width: 548, height: 548 };

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

const iconBuffer = await sharp(fullLogoPath).extract(ICON_CROP).png().toBuffer();

await sharp(iconBuffer).resize(256, 256).png().toFile(join(root, "public/logo-mark.png"));
await sharp(iconBuffer).resize(512, 512).png().toFile(join(root, "public/brand/logo-symbol-512.png"));

for (const { name, size } of iconSizes) {
  await sharp(iconBuffer)
    .resize(size, size)
    .png()
    .toFile(join(root, "public/icons", name));
  console.log(`Generated icons/${name}`);
}

await sharp(iconBuffer).resize(32, 32).png().toFile(join(root, "public/favicon.ico"));

console.log("Generated logo-mark.png, favicon.ico and brand/logo-symbol-512.png");
