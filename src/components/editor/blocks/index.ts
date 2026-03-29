import { aiBlockSpec } from "@/components/editor/blocks/AIBlock";
import { audioMediaBlockSpec } from "@/components/editor/blocks/AudioBlock";
import { codeBlockSpec } from "@/components/editor/blocks/CodeBlock";
import { equationBlockSpec } from "@/components/editor/blocks/EquationBlock";
import { imageMediaBlockSpec } from "@/components/editor/blocks/ImageBlock";
import { linkPreviewBlockSpec } from "@/components/editor/blocks/LinkPreviewBlock";
import { pdfMediaBlockSpec } from "@/components/editor/blocks/PdfBlock";
import { videoEmbedBlockSpec } from "@/components/editor/blocks/VideoBlock";

export const customBlockSpecs = {
	imageMedia: imageMediaBlockSpec(),
	linkPreview: linkPreviewBlockSpec(),
	pdfMedia: pdfMediaBlockSpec(),
	audioMedia: audioMediaBlockSpec(),
	videoEmbed: videoEmbedBlockSpec(),
	equation: equationBlockSpec(),
	codeBlock: codeBlockSpec(),
	aiBlock: aiBlockSpec(),
};

export type CustomBlockType = keyof typeof customBlockSpecs;
