import type { ThemeRegistration } from "shiki";

export const stacknoteTheme: ThemeRegistration = {
	name: "stacknote-oled",
	type: "dark",
	colors: {
		"editor.background": "#0a0a0a",
		"editor.foreground": "#e8e8e8",
		"editorLineNumber.foreground": "#444444",
		"editorLineNumber.activeForeground": "#888888",
	},
	tokenColors: [
		{
			scope: ["keyword", "storage.type", "storage.modifier"],
			settings: { foreground: "#c792ea", fontStyle: "italic" },
		},
		{ scope: ["string", "string.quoted"], settings: { foreground: "#c3e88d" } },
		{ scope: ["constant.numeric"], settings: { foreground: "#f78c6c" } },
		{ scope: ["comment"], settings: { foreground: "#546e7a", fontStyle: "italic" } },
		{ scope: ["entity.name.function", "support.function"], settings: { foreground: "#82aaff" } },
		{ scope: ["entity.name.class", "entity.name.type", "support.class"], settings: { foreground: "#ffcb6b" } },
		{ scope: ["variable", "variable.parameter"], settings: { foreground: "#e8e8e8" } },
		{ scope: ["keyword.operator", "punctuation"], settings: { foreground: "#89ddff" } },
		{ scope: ["constant.language"], settings: { foreground: "#ff5370", fontStyle: "italic" } },
		{ scope: ["entity.name.tag"], settings: { foreground: "#f07178" } },
		{ scope: ["entity.other.attribute-name"], settings: { foreground: "#c792ea" } },
		{ scope: ["support.type.property-name"], settings: { foreground: "#7c6aff" } },
		{ scope: ["entity.name.module", "support.module"], settings: { foreground: "#ffcb6b" } },
		{ scope: ["meta.decorator", "punctuation.decorator"], settings: { foreground: "#82aaff", fontStyle: "italic" } },
		{ scope: ["string.regexp"], settings: { foreground: "#f78c6c" } },
	],
};

export const SUPPORTED_LANGUAGES = [
	{ id: "typescript", label: "TypeScript", icon: "TS" },
	{ id: "javascript", label: "JavaScript", icon: "JS" },
	{ id: "tsx", label: "TSX", icon: "TSX" },
	{ id: "jsx", label: "JSX", icon: "JSX" },
	{ id: "python", label: "Python", icon: "PY" },
	{ id: "rust", label: "Rust", icon: "RS" },
	{ id: "go", label: "Go", icon: "GO" },
	{ id: "java", label: "Java", icon: "JA" },
	{ id: "cpp", label: "C++", icon: "C++" },
	{ id: "c", label: "C", icon: "C" },
	{ id: "csharp", label: "C#", icon: "C#" },
	{ id: "php", label: "PHP", icon: "PHP" },
	{ id: "ruby", label: "Ruby", icon: "RB" },
	{ id: "swift", label: "Swift", icon: "SW" },
	{ id: "kotlin", label: "Kotlin", icon: "KT" },
	{ id: "html", label: "HTML", icon: "HTML" },
	{ id: "css", label: "CSS", icon: "CSS" },
	{ id: "scss", label: "SCSS", icon: "SCSS" },
	{ id: "json", label: "JSON", icon: "{}" },
	{ id: "yaml", label: "YAML", icon: "YML" },
	{ id: "markdown", label: "Markdown", icon: "MD" },
	{ id: "sql", label: "SQL", icon: "SQL" },
	{ id: "bash", label: "Bash/Shell", icon: "$_" },
	{ id: "dockerfile", label: "Dockerfile", icon: "DK" },
	{ id: "prisma", label: "Prisma", icon: "PR" },
] as const;

export const SHIKI_LANGUAGE_IDS = SUPPORTED_LANGUAGES.map((lang) => lang.id);

export type SupportedLanguageId = (typeof SUPPORTED_LANGUAGES)[number]["id"];
