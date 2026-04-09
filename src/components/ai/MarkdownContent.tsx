"use client";

import "katex/dist/katex.min.css";

import { memo, useMemo } from "react";
import katex from "katex";
import { markdownToHTML } from "@blocknote/core";
import { normalizeLatexSource } from "@/lib/latex";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
	content: string;
	className?: string;
}

function escapeHtml(content: string): string {
	return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function normalizeMarkdownSource(content: string) {
	return content.replace(/<br\s*\/?>/gi, "\n");
}

function renderKatexExpression(source: string, displayMode: boolean) {
	const normalizedSource = normalizeLatexSource(source).trim() || "\\,";

	try {
		return katex.renderToString(normalizedSource, {
			displayMode,
			throwOnError: true,
		});
	} catch {
		const wrapper = displayMode ? "div" : "span";
		return `<${wrapper} class="stacknote-ai-latex-fallback">${displayMode ? `$$${source}$$` : `$${source}$`}</${wrapper}>`;
	}
}

function withProtectedCodeBlocks(html: string, transform: (value: string) => string) {
	const placeholders: string[] = [];
	const protectedHtml = html.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/g, (match) => {
		const token = `__STACKNOTE_CODE_BLOCK_${placeholders.length}__`;
		placeholders.push(match);
		return token;
	});

	return placeholders.reduce((result, match, index) => result.replace(`__STACKNOTE_CODE_BLOCK_${index}__`, match), transform(protectedHtml));
}

function renderLatexInHtml(html: string) {
	if (!html.includes("$") && !html.includes("\\(") && !html.includes("\\[")) {
		return html;
	}

	return withProtectedCodeBlocks(html, (value) =>
		value
			.replace(/\\\[([\s\S]+?)\\\]/g, (_, latex: string) => renderKatexExpression(latex, true))
			.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex: string) => renderKatexExpression(latex, true))
			.replace(/\\\(([\s\S]+?)\\\)/g, (_, latex: string) => renderKatexExpression(latex, false))
			.replace(/(^|[^\$\\])\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_match, prefix: string, latex: string) => `${prefix}${renderKatexExpression(latex, false)}`),
	);
}

function renderMarkdown(content: string): string {
	const html = markdownToHTML(escapeHtml(normalizeMarkdownSource(content)));
	return renderLatexInHtml(html);
}

export const MarkdownContent = memo(function MarkdownContent({ content, className }: MarkdownContentProps) {
	const html = useMemo(() => renderMarkdown(content), [content]);

	return <div className={cn("stacknote-ai-markdown", className)} dangerouslySetInnerHTML={{ __html: html }} />;
});
