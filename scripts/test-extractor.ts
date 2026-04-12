import "dotenv/config";

let extractSearchableText: (content: unknown) => string;

type TestCase = {
	id: string;
	name: string;
	inputSummary: string;
	input: unknown;
	expected: string;
};

const cases: TestCase[] = [
	{
		id: "1",
		name: "Basic paragraph",
		inputSummary: "Single paragraph with plain text",
		input: [
			{
				type: "paragraph",
				content: [{ type: "text", text: "The mitochondria is the powerhouse of the cell." }],
				children: [],
			},
		],
		expected: "The mitochondria is the powerhouse of the cell.",
	},
	{
		id: "2",
		name: "Mixed block types",
		inputSummary: "Heading followed by two bullet list items",
		input: [
			{
				type: "heading",
				content: [{ type: "text", text: "Introduction" }],
				children: [],
			},
			{
				type: "bulletListItem",
				content: [{ type: "text", text: "First point" }],
				children: [],
			},
			{
				type: "bulletListItem",
				content: [{ type: "text", text: "Second point" }],
				children: [],
			},
		],
		expected: "Introduction First point Second point",
	},
	{
		id: "3",
		name: "Nested children",
		inputSummary: "Bullet item with nested child bullet item",
		input: [
			{
				type: "bulletListItem",
				content: [{ type: "text", text: "Parent item" }],
				children: [
					{
						type: "bulletListItem",
						content: [{ type: "text", text: "Child item" }],
						children: [],
					},
				],
			},
		],
		expected: "Parent item Child item",
	},
	{
		id: "4",
		name: "Code block",
		inputSummary: "Code block with inline string content",
		input: [
			{
				type: "codeBlock",
				content: "const x = 42;",
				children: [],
			},
		],
		expected: "const x = 42;",
	},
	{
		id: "5",
		name: "Math block",
		inputSummary: "Math block with inline string content",
		input: [
			{
				type: "mathBlock",
				content: "E = mc^2",
				children: [],
			},
		],
		expected: "E = mc^2",
	},
	{
		id: "6",
		name: "Skip media blocks",
		inputSummary: "Image block followed by a paragraph caption",
		input: [
			{
				type: "image",
				props: { url: "https://example.com/image.png" },
				children: [],
			},
			{
				type: "paragraph",
				content: [{ type: "text", text: "Caption here" }],
				children: [],
			},
		],
		expected: "Caption here",
	},
	{
		id: "7",
		name: "Raw BlockNote JSON with metadata",
		inputSummary: "Block with id/props metadata plus real text content",
		input: [
			{
				id: "a1b2c3d4-5678-90ab-cdef-1234567890ab",
				type: "paragraph",
				props: {
					textColor: "blue",
					backgroundColor: "yellow",
					textAlignment: "left",
				},
				content: [{ type: "text", text: "Photosynthesis converts light into energy" }],
				children: [],
			},
		],
		expected: "Photosynthesis converts light into energy",
	},
];

function printPhaseBoundary(label: string) {
	console.log(`[${new Date().toISOString()}] ${label}`);
}

function summarizeInput(input: unknown) {
	return JSON.stringify(input, null, 2);
}

async function main() {
	({ extractSearchableText } = (await import(new URL("../src/lib/searchable-text.ts", import.meta.url).href)) as {
		extractSearchableText: (content: unknown) => string;
	});

	printPhaseBoundary("Phase 2 start: extractor tests");

	let passed = 0;

	for (const testCase of cases) {
		const actual = extractSearchableText(testCase.input);
		const ok = actual === testCase.expected;
		if (ok) {
			passed += 1;
		}

		console.log(`\nCase ${testCase.id} — ${testCase.name}`);
		console.log(`Input summary: ${testCase.inputSummary}`);
		console.log(`Input: ${summarizeInput(testCase.input)}`);
		console.log(`Actual:   ${JSON.stringify(actual)}`);
		console.log(`Expected: ${JSON.stringify(testCase.expected)}`);
		console.log(`Result:   ${ok ? "PASS" : "FAIL"}`);
	}

	console.log(`\nSummary: ${passed}/${cases.length} passed`);
	printPhaseBoundary("Phase 2 end: extractor tests");

	if (passed !== cases.length) {
		process.exitCode = 1;
	}
}

void main();
