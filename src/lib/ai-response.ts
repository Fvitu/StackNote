export interface ParsedAssistantContent {
	finalContent: string;
	reasoning: string;
	hasReasoning: boolean;
	reasoningComplete: boolean;
}

export interface AssistantUsageMetadata {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface ParsedAssistantResponseContent extends ParsedAssistantContent {
	usage: AssistantUsageMetadata | null;
}

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";
const ASSISTANT_USAGE_METADATA_PREFIX = "<!-- stacknote-ai-usage:";

function joinSections(sections: string[]) {
	return sections
		.map((section) => section.trim())
		.filter(Boolean)
		.join("\n\n")
		.trim();
}

function extractAssistantUsageMetadata(content: string) {
	const metadataPattern = /\n<!-- stacknote-ai-usage:(\{[\s\S]*\}) -->\s*$/;
	const match = content.match(metadataPattern);

	if (!match) {
		return {
			content: content.trimEnd(),
			usage: null,
		};
	}

	try {
		const usage = JSON.parse(match[1] ?? "") as AssistantUsageMetadata;
		if (typeof usage.inputTokens !== "number" || typeof usage.outputTokens !== "number" || typeof usage.totalTokens !== "number") {
			return {
				content: content.trimEnd(),
				usage: null,
			};
		}

		return {
			content: content.slice(0, match.index ?? content.length).trimEnd(),
			usage,
		};
	} catch {
		return {
			content: content.trimEnd(),
			usage: null,
		};
	}
}

export function parseAssistantContent(content: string): ParsedAssistantContent {
	if (!content.trim()) {
		return {
			finalContent: "",
			reasoning: "",
			hasReasoning: false,
			reasoningComplete: false,
		};
	}

	const reasoningSections: string[] = [];
	const finalSections: string[] = [];
	let cursor = 0;

	while (cursor < content.length) {
		const thinkStart = content.indexOf(THINK_OPEN_TAG, cursor);
		if (thinkStart === -1) {
			finalSections.push(content.slice(cursor));
			break;
		}

		finalSections.push(content.slice(cursor, thinkStart));

		const reasoningStart = thinkStart + THINK_OPEN_TAG.length;
		const thinkEnd = content.indexOf(THINK_CLOSE_TAG, reasoningStart);

		if (thinkEnd === -1) {
			reasoningSections.push(content.slice(reasoningStart));
			return {
				finalContent: joinSections(finalSections),
				reasoning: joinSections(reasoningSections),
				hasReasoning: reasoningSections.some((section) => section.trim().length > 0),
				reasoningComplete: false,
			};
		}

		reasoningSections.push(content.slice(reasoningStart, thinkEnd));
		cursor = thinkEnd + THINK_CLOSE_TAG.length;
	}

	const reasoning = joinSections(reasoningSections);

	return {
		finalContent: joinSections(finalSections),
		reasoning,
		hasReasoning: reasoning.length > 0,
		reasoningComplete: reasoning.length > 0,
	};
}

export function stripAssistantReasoning(content: string) {
	return parseAssistantContent(content).finalContent;
}

export function appendAssistantUsageMetadata(content: string, usage: AssistantUsageMetadata) {
	return `${content}\n${ASSISTANT_USAGE_METADATA_PREFIX}${JSON.stringify(usage)} -->`;
}

export function parseAssistantResponseContent(content: string): ParsedAssistantResponseContent {
	const extracted = extractAssistantUsageMetadata(content);
	const parsed = parseAssistantContent(extracted.content);

	return {
		...parsed,
		usage: extracted.usage,
	};
}
