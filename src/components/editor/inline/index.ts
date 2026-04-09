import { inlineEquationSpec } from "@/components/editor/inline/InlineEquation";

export const customInlineContentSpecs = {
	inlineEquation: inlineEquationSpec,
};

export type CustomInlineContentType = keyof typeof customInlineContentSpecs;
