import path from "node:path";
import sharp from "sharp";

const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512] as const;
const MASKABLE_SIZES = [192, 512] as const;
const APPLE_TOUCH_SIZES = [152, 167, 180] as const;
const ROOT_DIR = process.cwd();
const ICONS_DIR = path.join(ROOT_DIR, "public", "icons");
const SOURCE_ICON = path.join(ICONS_DIR, "icon-512.png");

async function generateStandardIcons(sourceBuffer: Buffer) {
	for (const size of ICON_SIZES) {
		const output = path.join(ICONS_DIR, `icon-${size}.png`);
		await sharp(sourceBuffer)
			.resize(size, size, {
				fit: "cover",
				position: "center",
			})
			.png()
			.toFile(output);
	}
}

async function generateMaskableIcons(sourceBuffer: Buffer) {
	for (const size of MASKABLE_SIZES) {
		const innerSize = Math.floor(size * 0.8);
		const padding = Math.floor((size - innerSize) / 2);
		const output = path.join(ICONS_DIR, `icon-${size}-maskable.png`);

		await sharp(sourceBuffer)
			.resize(innerSize, innerSize, {
				fit: "cover",
				position: "center",
			})
			.extend({
				top: padding,
				bottom: size - innerSize - padding,
				left: padding,
				right: size - innerSize - padding,
				background: { r: 10, g: 10, b: 10, alpha: 1 },
			})
			.png()
			.toFile(output);
	}
}

async function generateAppleTouchIcons(sourceBuffer: Buffer) {
	for (const size of APPLE_TOUCH_SIZES) {
		const output = path.join(ICONS_DIR, `apple-touch-icon-${size}x${size}.png`);
		await sharp(sourceBuffer)
			.resize(size, size, {
				fit: "cover",
				position: "center",
			})
			.png()
			.toFile(output);
	}

	const defaultAppleTouch = path.join(ICONS_DIR, "apple-touch-icon.png");
	await sharp(sourceBuffer)
		.resize(180, 180, {
			fit: "cover",
			position: "center",
		})
		.png()
		.toFile(defaultAppleTouch);
}

async function main() {
	const sourceBuffer = await sharp(SOURCE_ICON).png().toBuffer();
	await generateStandardIcons(sourceBuffer);
	await generateMaskableIcons(sourceBuffer);
	await generateAppleTouchIcons(sourceBuffer);
	console.log("Generated PWA icons in public/icons");
}

void main();
