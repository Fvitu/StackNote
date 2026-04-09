export const MEDIA_TYPES = ["image", "pdf", "audio", "video"] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

export function isMediaType(value: string): value is MediaType {
	return MEDIA_TYPES.includes(value as MediaType);
}

export function getMediaTypeFromFile(file: File): MediaType | null {
	const mime = file.type.toLowerCase();

	if (mime.startsWith("image/")) return "image";
	if (mime === "application/pdf") return "pdf";
	if (mime.startsWith("audio/")) return "audio";
	if (mime.startsWith("video/")) return "video";

	return null;
}

export function getAcceptForType(type: MediaType): string {
	switch (type) {
		case "image":
			return "image/*,.png,.jpg,.jpeg,.webp,.gif,.svg";
		case "pdf":
			return ".pdf,application/pdf";
		case "audio":
			return "audio/*,.mp3,.wav,.m4a,.ogg";
		case "video":
			return "video/*,.mp4,.webm,.mov";
	}
}

export function getFileExtension(fileName: string): string {
	const part = fileName.split(".").pop();
	return part ? part.toLowerCase() : "bin";
}

export function parseVideoEmbedUrl(url: string): {
	embedUrl: string;
	platform: "youtube" | "loom" | "vimeo" | "unknown";
} {
	const youtube = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\s]+)/);
	if (youtube) {
		return { embedUrl: `https://www.youtube.com/embed/${youtube[1]}`, platform: "youtube" };
	}

	const loom = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
	if (loom) {
		return { embedUrl: `https://www.loom.com/embed/${loom[1]}`, platform: "loom" };
	}

	const vimeo = url.match(/vimeo\.com\/(\d+)/);
	if (vimeo) {
		return { embedUrl: `https://player.vimeo.com/video/${vimeo[1]}`, platform: "vimeo" };
	}

	return { embedUrl: url, platform: "unknown" };
}
