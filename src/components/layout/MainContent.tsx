"use client"

import { useState, useEffect, useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { format } from "date-fns";
import { FileText, Plus, PanelLeftOpen, Undo2, Redo2, CalendarClock, Clock3, History, Sparkles } from "lucide-react";
import { NoteEditor, type NoteEditorRef } from "@/components/editor/NoteEditor"
import { NoteTitle } from "@/components/editor/NoteTitle"
import { SaveIndicator } from "@/components/editor/SaveIndicator"
import { NoteCoverPanel } from "@/components/layout/NoteCoverPanel";
import { useWorkspace } from "@/contexts/WorkspaceContext"
import { NoteActionsMenu } from "@/components/layout/NoteActionsMenu"
import { NoteVersionsDialog } from "@/components/layout/NoteVersionsDialog";
import { normalizeBlockNoteContent } from "@/lib/blocknote-normalize";
import { resolveNoteCoverMeta } from "@/lib/note-cover";
import { useNoteCache, type CachedNote, type CachedNoteMetadata } from "@/hooks/useNoteCache";
import {
	NOTE_VERSION_IDLE_THRESHOLD_MS,
	NOTE_VERSION_MAX_INTERVAL_MS,
	NOTE_VERSION_LIMIT,
	type NoteVersionDetail,
	type NoteVersionSummary,
} from "@/lib/note-versioning";
import { AISidePanel } from "@/components/ai/AISidePanel";

const EMOJI_LIST = [
  // Smileys & Emotion
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","🫠","😉","😊","😇","🥰","😍","🤩","😘","😗","☺️","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🫢","🫣","🤫","🤔","🫡","🤐","🤨","😐","😑","😶","🫥","😶‍🌫️","😏","😒","🙄","😬","😮‍💨","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","😵‍💫","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","☹️","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸","😹","😻","😼","😽","🙀","😿","😾",

  // Gestures & People
  "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","💋",

  // People & Body
  "👶","👧","🧒","👦","👩","🧑","👨","👩‍🦱","🧑‍🦱","👨‍🦱","👩‍🦰","🧑‍🦰","👨‍🦰","👱‍♀️","👱","👱‍♂️","👩‍🦳","🧑‍🦳","👨‍🦳","👩‍🦲","🧑‍🦲","👨‍🦲","🧔‍♀️","🧔","🧔‍♂️","👵","🧓","👴","👲","👳‍♀️","👳","👳‍♂️","🧕","👮‍♀️","👮","👮‍♂️","👷‍♀️","👷","👷‍♂️","💂‍♀️","💂","💂‍♂️","🕵️‍♀️","🕵️","🕵️‍♂️","👩‍⚕️","🧑‍⚕️","👨‍⚕️","👩‍🌾","🧑‍🌾","👨‍🌾","👩‍🍳","🧑‍🍳","👨‍🍳","👩‍🎓","🧑‍🎓","👨‍🎓","👩‍🎤","🧑‍🎤","👨‍🎤","👩‍🏫","🧑‍🏫","👨‍🏫","👩‍🏭","🧑‍🏭","👨‍🏭","👩‍💻","🧑‍💻","👨‍💻","👩‍💼","🧑‍💼","👨‍💼","👩‍🔧","🧑‍🔧","👨‍🔧","👩‍🔬","🧑‍🔬","👨‍🔬","👩‍🎨","🧑‍🎨","👨‍🎨","👩‍🚒","🧑‍🚒","👨‍🚒","👩‍✈️","🧑‍✈️","👨‍✈️","👩‍🚀","🧑‍🚀","👨‍🚀","👩‍⚖️","🧑‍⚖️","👨‍⚖️","👰‍♀️","👰","👰‍♂️","🤵‍♀️","🤵","🤵‍♂️","👸","🤴","🥷","🦸‍♀️","🦸","🦸‍♂️","🦹‍♀️","🦹","🦹‍♂️","🧙‍♀️","🧙","🧙‍♂️","🧚‍♀️","🧚","🧚‍♂️","🧛‍♀️","🧛","🧛‍♂️","🧜‍♀️","🧜","🧜‍♂️","🧝‍♀️","🧝","🧝‍♂️","🧞‍♀️","🧞","🧞‍♂️","🧟‍♀️","🧟","🧟‍♂️","🧌","💆‍♀️","💆","💆‍♂️","💇‍♀️","💇","💇‍♂️","🚶‍♀️","🚶","🚶‍♂️","🧍‍♀️","🧍","🧍‍♂️","🧎‍♀️","🧎","🧎‍♂️","🧑‍🦯","👨‍🦯","👩‍🦼","🧑‍🦼","👨‍🦼","👩‍🦽","🧑‍🦽","👨‍🦽","🏃‍♀️","🏃","🏃‍♂️","💃","🕺","🕴️","👯‍♀️","👯","👯‍♂️","🧖‍♀️","🧖","🧖‍♂️","🧗‍♀️","🧗","🧗‍♂️",

  // Animals & Nature
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🕸️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🦭","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔","🐾","🐉","🐲","🌵","🎄","🌲","🌳","🌴","🪵","🌱","🌿","☘️","🍀","🎍","🪴","🎋","🍃","🍂","🍁","🍄","🐚","🪨","🌾","💐","🌷","🌹","🥀","🪷","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌖","🌗","🌘","🌑","🌒","🌓","🌔","🌙","🌎","🌍","🌏","🪐","💫","⭐","🌟","⚡","☄️","💥","🔥","🌪️","🌈","☀️","🌤️","⛅","🌥️","☁️","🌦️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","⛄","🌬️","💨","💧","💦","☔","☂️","🌊","🌫️",

  // Food & Drink
  "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥑","🍆","🍅","🌶️","🫑","🥒","🥬","🥦","🧄","🧅","🌽","🥕","🫒","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🫕","🥫","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥠","🥮","🍢","🍡","🍧","🍨","🍦","🥧","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🫘","🍯","🥛","🍼","🫖","☕","🍵","🧃","🥤","🧋","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾","🧊","🥄","🍴","🍽️","🥣","🥡","🥢","🧂",

  // Travel & Places
  "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦼","🛴","🚲","🛵","🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅","🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","⛽","🚧","🚦","🚥","🚏","🗺️","🗼","🏰","🏯","🏟️","🎡","🎢","🎠","⛲","⛱️","🏖️","🏝️","🏜️","🌋","⛰️","🏔️","🗻","🏕️","⛺","🛖","🏠","🏡","🏘️","🏚️","🏗️","🏭","🏢","🏬","🏣","🏤","🏥","🏦","🏨","🏪","🏫","🏩","💒","🏛️","⛪","🕌","🕍","🛕","🕋","⛩️","🛤️","🛣️","🗾","🎑","🏞️","🌅","🌄","🌠","🎇","🎆","🌇","🌆","🏙️","🌃","🌌","🌉","🌁",

  // Activities
  "🎃","🧨","🎈","🎉","🎊","🎎","🎏","🎐","🧧","🎀","🎁","🎗️","🎟️","🎫","🎖️","🏆","🏅","🥇","🥈","🥉","⚽","⚾","🥎","🏀","🏐","🏈","🏉","🎾","🥏","🎳","🏏","🏑","🏒","🥍","🏓","🏸","🥊","🥋","🥅","⛳","⛸️","🎣","🤿","🎽","🎿","🛷","🥌","🎯","🪀","🪁","🎱","🔮","🪄","🧿","🪬","🎮","🕹️","🎰","🎲","🧩","🧸","🪅","🪩","🪆","♠️","♥️","♦️","♣️","♟️","🃏","🀄","🎴","🎭","🖼️","🎨","🧵","🪡","🧶","🪢",

  // Objects
  "👓","🕶️","🥽","🥼","🦺","👔","👕","👖","🧣","🧤","🧥","🧦","👗","👘","🥻","🩱","🩲","🩳","👙","👚","👛","👜","👝","🛍️","🎒","🩴","👞","👟","🥾","🥿","👠","👡","🩰","👢","👑","👒","🎩","🎓","🧢","🪖","⛑️","📿","💄","💍","💎","🔇","🔈","🔉","🔊","📢","📣","📯","🔔","🔕","🎼","🎵","🎶","🎙️","🎚️","🎛️","🎤","🎧","📻","🎷","🪗","🎸","🎹","🎺","🎻","🪕","🥁","🪘","📱","📲","☎️","📞","📟","📠","🔋","🔌","💻","🖥️","🖨️","⌨️","🖱️","🖲️","💽","💾","💿","📀","🧮","🎥","🎞️","📽️","🎬","📺","📷","📸","📹","📼","🔍","🔎","🕯️","💡","🔦","🏮","🪔","📔","📕","📖","📗","📘","📙","📚","📓","📒","📃","📜","📄","📰","🗞️","📑","🔖","🏷️","💰","🪙","💴","💵","💶","💷","💸","💳","🧾","💹","✉️","📧","📨","📩","📤","📥","📦","📫","📪","📬","📭","📮","🗳️","✏️","✒️","🖋️","🖊️","🖌️","🖍️","📝","💼","📁","📂","🗂️","📅","📆","🗒️","🗓️","📇","📈","📉","📊","📋","📌","📍","📎","🖇️","📏","📐","✂️","🗃️","🗄️","🗑️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🔫","🪃","🏹","🛡️","🪚","🔧","🪛","🔩","⚙️","🗜️","⚖️","🦯","🔗","⛓️","🧰","🧲","🪜","⚗️","🧪","🧫","🧬","🔬","🔭","📡","💉","🩹","🩼","🩺","🩻","🚪","🛗","🪞","🪟","🛏️","🛋️","🪑","🚽","🪠","🚿","🛁","🪤","🪒","🧴","🧷","🧹","🧺","🧻","🪣","🧼","🫧","🪥","🧽","🧯","🛒","🚬","⚰️","🪦","⚱️","🪧","🪪",

  // Symbols
  "🏧","🚮","🚰","♿","🚹","🚺","🚻","🚼","🚾","🛂","🛃","🛄","🛅","⚠️","🚸","⛔","🚫","🚳","🚭","🚯","🚱","🚷","📵","🔞","☢️","☣️","⬆️","↗️","➡️","↘️","⬇️","↙️","⬅️","↖️","↕️","↔️","↩️","↪️","⤴️","⤵️","🔃","🔄","🔙","🔚","🔛","🔜","🔝","🛐","⚛️","🕉️","☸️","☯️","☦️","☮️","🕎","🔯","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","⛎","🔀","🔁","🔂","▶️","⏩","⏭️","⏯️","◀️","⏪","⏮️","🔼","⏫","🔽","⏬","⏸️","⏹️","⏺️","⏏️","🎦","🔅","🔆","📶","📳","📴","♀️","♂️","⚧️","✖️","➕","➖","➗","🟰","♾️","‼️","⁉️","❓","❔","❕","❗","〰️","💱","💲","⚕️","♻️","⚜️","🔱","📛","🔰","⭕","✅","☑️","✔️","❌","❎","➰","➿","〽️","✳️","✴️","❇️","©️","®️","™️","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔠","🔡","🔢","🔣","🔤","🅰️","🆎","🅱️","🆑","🆒","🆓","ℹ️","🆔","Ⓜ️","🆕","🆖","🅾️","🆗","🅿️","🆘","🆙","🆚","🈁","🈂️","🈷️","🈶","🈯","🉐","🈹","🈚","🈲","🉑","🈸","🈴","🈳","㊗️","㊙️","🈺","🈵","🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟥","🟧","🟨","🟩","🟦","🟪","🟫","⬛","⬜","◼️","◻️","◾","◽","▪️","▫️","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔳","🔲","🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️",

  // Hearts & Love
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟",
]

interface MainContentProps {
  workspaceId: string
  workspaceName: string
  onNoteCreated: () => void
  onRefresh: () => void
  isSidebarOpen: boolean
  onToggleSidebar: () => void
}

interface NoteData {
	id: string;
	title: string;
	emoji?: string | null;
	coverImage: string | null;
	coverImageMeta?: unknown;
	content: unknown;
	createdAt: string;
	updatedAt: string;
	editorWidth?: number | null;
	workspace: { name: string };
	folder: { name: string } | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline" | "syncing" | "synced";

type MarqueeSelection = {
	startX: number;
	startY: number;
	currentX: number;
	currentY: number;
};

const DEFAULT_EDITOR_WIDTH = 720;
const MIN_EDITOR_WIDTH = 560;
const MAX_EDITOR_WIDTH = 1200;
const DEFAULT_AI_PANEL_WIDTH = 360;
const MIN_AI_PANEL_WIDTH = 320;
const MAX_AI_PANEL_WIDTH = 760;

function getRectFromMarquee(selection: MarqueeSelection): DOMRect {
	const left = Math.min(selection.startX, selection.currentX);
	const right = Math.max(selection.startX, selection.currentX);
	const top = Math.min(selection.startY, selection.currentY);
	const bottom = Math.max(selection.startY, selection.currentY);

	return new DOMRect(left, top, right - left, bottom - top);
}

function shouldStartCanvasMarquee(event: ReactPointerEvent<HTMLDivElement>): boolean {
	if (event.button !== 0) {
		return false;
	}

	const target = event.target;
	return target instanceof HTMLElement && target === event.currentTarget;
}

function getStoredNoteWidth(noteId: string): number | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(`note-width:${noteId}`);
	if (!raw) return null;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, parsed));
}

function setStoredNoteWidth(noteId: string, width: number) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(`note-width:${noteId}`, String(Math.round(width)));
}

function getStoredAiPanelWidth(): number | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem("ai-panel-width");
	if (!raw) return null;
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, parsed));
}

function setStoredAiPanelWidth(width: number) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem("ai-panel-width", String(Math.round(width)));
}

function isTextEntryElement(target: EventTarget | null): boolean {
	return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select"));
}

function buildCachedMetadata(note: NoteData): CachedNoteMetadata {
	return {
		emoji: note.emoji ?? null,
		coverImage: note.coverImage,
		coverImageMeta: note.coverImageMeta,
		createdAt: note.createdAt,
		workspace: note.workspace,
		folder: note.folder,
		editorWidth: note.editorWidth ?? null,
	};
}

function hydrateCachedNote(cachedNote: CachedNote, workspaceName: string): NoteData {
	return {
		id: cachedNote.id,
		title: cachedNote.title,
		emoji: cachedNote.metadata?.emoji ?? null,
		coverImage: cachedNote.metadata?.coverImage ?? null,
		coverImageMeta: cachedNote.metadata?.coverImageMeta,
		content: cachedNote.content,
		createdAt: cachedNote.metadata?.createdAt ?? cachedNote.updatedAt,
		updatedAt: cachedNote.updatedAt,
		editorWidth: cachedNote.metadata?.editorWidth ?? null,
		workspace: cachedNote.metadata?.workspace ?? { name: workspaceName },
		folder: cachedNote.metadata?.folder ?? null,
	};
}

export function MainContent({ workspaceId, workspaceName, onNoteCreated, onRefresh, isSidebarOpen, onToggleSidebar }: MainContentProps) {
	const { state, setActiveNote } = useWorkspace();
	const noteCache = useNoteCache();
	const [note, setNote] = useState<NoteData | null>(null);
	const noteRef = useRef<NoteData | null>(null);
	const [loading, setLoading] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
	const [isNewNote, setIsNewNote] = useState(false);
	const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
	const [editorWidth, setEditorWidth] = useState(DEFAULT_EDITOR_WIDTH);
	const [isResizing, setIsResizing] = useState(false);
	const editorShellRef = useRef<HTMLDivElement | null>(null);
	const mainScrollRef = useRef<HTMLDivElement | null>(null);
	const marqueeSelectionRef = useRef<MarqueeSelection | null>(null);
	const editorWidthDraftRef = useRef(DEFAULT_EDITOR_WIDTH);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const emojiWrapperRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<NoteEditorRef>(null);
	const resizeStartXRef = useRef(0);
	const resizeStartWidthRef = useRef(DEFAULT_EDITOR_WIDTH);
	const animationFrameRef = useRef<number | null>(null);
	const currentContentRef = useRef<unknown>(null);
	const lastEditAtRef = useRef<number | null>(null);
	const firstEditSinceVersionAtRef = useRef<number | null>(null);
	const lastVersionCreatedAtRef = useRef<number | null>(null);
	const hasEditsSinceVersionRef = useRef(false);
	const versionRequestInFlightRef = useRef(false);
	const syncInFlightRef = useRef(false);
	const [canUndo, setCanUndo] = useState(false);
	const [canRedo, setCanRedo] = useState(false);
	const [versionsOpen, setVersionsOpen] = useState(false);
	const [versionsLoading, setVersionsLoading] = useState(false);
	const [versions, setVersions] = useState<NoteVersionSummary[]>([]);
	const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
	const [previewVersion, setPreviewVersion] = useState<NoteVersionDetail | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
	const [isCreatingManualVersion, setIsCreatingManualVersion] = useState(false);
	const [editorResetToken, setEditorResetToken] = useState(0);
	const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
	const [isAiPanelMounted, setIsAiPanelMounted] = useState(false);
	const [aiPanelWidth, setAiPanelWidth] = useState(() => getStoredAiPanelWidth() ?? DEFAULT_AI_PANEL_WIDTH);
	const [isAiPanelResizing, setIsAiPanelResizing] = useState(false);
	const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelection | null>(null);
	const [isMarqueeActive, setIsMarqueeActive] = useState(false);
	const aiPanelRef = useRef<HTMLDivElement | null>(null);
	const aiPanelWidthDraftRef = useRef(getStoredAiPanelWidth() ?? DEFAULT_AI_PANEL_WIDTH);
	const aiPanelResizeStartXRef = useRef(0);
	const aiPanelResizeStartWidthRef = useRef(DEFAULT_AI_PANEL_WIDTH);
	const aiPanelAnimationFrameRef = useRef<number | null>(null);
	const aiPanelOpenFrameRef = useRef<number | null>(null);
	const aiPanelCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const marqueeSelectionFrameRef = useRef<number | null>(null);
	const marqueeAutoScrollFrameRef = useRef<number | null>(null);
	const marqueeSelectionKeyRef = useRef("");
	const marqueePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);

	const applyEditorWidth = useCallback((width: number) => {
		editorWidthDraftRef.current = width;
		if (editorShellRef.current) {
			editorShellRef.current.style.width = `${width}px`;
		}
	}, []);

	const applyAiPanelWidth = useCallback((width: number) => {
		aiPanelWidthDraftRef.current = width;
		if (aiPanelRef.current) {
			if (typeof window !== "undefined" && window.innerWidth < 768) {
				aiPanelRef.current.style.width = "100%";
				return;
			}
			aiPanelRef.current.style.width = `${width}px`;
		}
	}, []);

	const setCurrentNoteState = useCallback((nextNote: NoteData | null) => {
		noteRef.current = nextNote;
		setNote(nextNote);
		if (nextNote) {
			currentContentRef.current = normalizeBlockNoteContent(nextNote.content);
			return;
		}

		currentContentRef.current = null;
	}, []);

	const updateCurrentNoteState = useCallback((updater: (current: NoteData) => NoteData) => {
		const current = noteRef.current;
		if (!current) {
			return null;
		}

		const next = updater(current);
		noteRef.current = next;
		setNote(next);
		currentContentRef.current = normalizeBlockNoteContent(next.content);
		return next;
	}, []);

	const applyLoadedNoteState = useCallback(
		(nextNote: NoteData) => {
			setCurrentNoteState(nextNote);
			setEditorResetToken((token) => token + 1);
			setIsNewNote(nextNote.title === "Untitled" && !nextNote.content);

			const persistedWidth = getStoredNoteWidth(nextNote.id);
			const widthFromServer = typeof nextNote.editorWidth === "number" ? nextNote.editorWidth : null;
			const viewportMax =
				typeof window !== "undefined"
					? Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, Math.floor((window.innerWidth - 96) * 0.95)))
					: DEFAULT_EDITOR_WIDTH;

			const nextWidth =
				persistedWidth ?? (widthFromServer !== null ? Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, widthFromServer)) : viewportMax);
			setEditorWidth(nextWidth);
			applyEditorWidth(nextWidth);
		},
		[applyEditorWidth, setCurrentNoteState],
	);

	const cacheNoteSnapshot = useCallback(
		(sourceNote: NoteData, content: unknown = currentContentRef.current ?? sourceNote.content, dirty?: boolean) => {
			const existingEntry = noteCache.getCachedNote(sourceNote.id);
			noteCache.upsertCachedNote({
				id: sourceNote.id,
				title: sourceNote.title,
				content,
				updatedAt: sourceNote.updatedAt,
				dirty: dirty ?? existingEntry?.dirty ?? false,
				metadata: buildCachedMetadata(sourceNote),
			});
		},
		[noteCache],
	);

	const queueOfflineContent = useCallback(
		(content: unknown) => {
			const current = noteRef.current;
			if (!current) {
				return;
			}

			noteCache.upsertCachedNote({
				id: current.id,
				title: current.title,
				content,
				updatedAt: current.updatedAt,
				dirty: true,
				metadata: buildCachedMetadata(current),
			});
		},
		[noteCache],
	);

	const showTransientSaveStatus = useCallback((status: Extract<SaveStatus, "saved" | "synced">) => {
		setSaveStatus(status);
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
	}, []);

	const markSaveSuccess = useCallback(() => {
		showTransientSaveStatus("saved");
	}, [showTransientSaveStatus]);

	const markSyncSuccess = useCallback(() => {
		showTransientSaveStatus("synced");
	}, [showTransientSaveStatus]);

	const markSaveFailure = useCallback(() => {
		setSaveStatus(isOnline ? "error" : "offline");
	}, [isOnline]);

	const patchActiveNote = useCallback(
		async (payload: Record<string, unknown>): Promise<{ updatedAt: string } | false> => {
			if (!state.activeNoteId) return false;
			if (!isOnline) {
				setSaveStatus("offline");
				return false;
			}

			const response = await fetch(`/api/notes/${state.activeNoteId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error("Failed to save note");
			}

			const updated = (await response.json()) as { updatedAt: string };
			return updated;
		},
		[isOnline, state.activeNoteId],
	);

	const persistNoteContent = useCallback(async (noteId: string, content: unknown) => {
		const response = await fetch(`/api/notes/${noteId}/autosave`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content }),
		});

		if (!response.ok) {
			throw new Error("Failed to autosave note");
		}

		return (await response.json()) as {
			id: string;
			content: unknown;
			updatedAt: string;
		};
	}, []);

	const createVersionRequest = useCallback(async (noteId: string, payload: { manual: boolean; label?: string; content?: unknown }) => {
		const response = await fetch(`/api/notes/${noteId}/versions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		const data = await response.json();
		if (!response.ok) {
			throw new Error(typeof data?.error === "string" ? data.error : "Failed to create version");
		}

		return data as {
			note: {
				id: string;
				content: unknown;
				updatedAt: string;
			};
			version: NoteVersionSummary | null;
			skipped: boolean;
		};
	}, []);

	const persistSessionBoundaryVersion = useCallback(
		async (noteId: string, content: unknown) => {
			if (!isOnline) {
				return;
			}

			try {
				await persistNoteContent(noteId, content);
				await createVersionRequest(noteId, {
					manual: false,
					content,
				});
			} catch {
				// Session-boundary checkpointing is best-effort.
			}
		},
		[createVersionRequest, isOnline, persistNoteContent],
	);

	useEffect(() => {
		if (typeof navigator === "undefined") return;

		const onOffline = () => {
			setIsOnline(false);
			setSaveStatus("offline");
		};
		const onOnline = () => {
			setIsOnline(true);
			setSaveStatus((prev) => (prev === "offline" ? "idle" : prev));
		};

		window.addEventListener("offline", onOffline);
		window.addEventListener("online", onOnline);

		return () => {
			window.removeEventListener("offline", onOffline);
			window.removeEventListener("online", onOnline);
		};
	}, []);

	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		const previousNote = noteRef.current;
		if (previousNote && previousNote.id !== state.activeNoteId && hasEditsSinceVersionRef.current) {
			void persistSessionBoundaryVersion(previousNote.id, currentContentRef.current);
		}

		hasEditsSinceVersionRef.current = false;
		lastEditAtRef.current = null;
		firstEditSinceVersionAtRef.current = null;
		lastVersionCreatedAtRef.current = null;
		setVersionsOpen(false);
		setVersions([]);
		setPreviewVersion(null);
		setPreviewVersionId(null);
		setPreviewLoading(false);

		if (!state.activeNoteId) {
			setCurrentNoteState(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		const cachedNote = noteCache.getCachedNote(state.activeNoteId);

		if (cachedNote) {
			noteCache.touchCachedNote(state.activeNoteId);
			applyLoadedNoteState(hydrateCachedNote(cachedNote, workspaceName));
			setLoading(false);
		} else {
			setLoading(true);
		}

		void (async () => {
			try {
				const response = await fetch(`/api/notes/${state.activeNoteId}`);
				if (!response.ok) {
					throw new Error("Failed to load note");
				}

				const remoteNote = (await response.json()) as NoteData;
				if (cancelled) {
					return;
				}

				const cachedEntry = noteCache.getCachedNote(remoteNote.id);
				const serverIsNewer = !cachedEntry || new Date(remoteNote.updatedAt).getTime() > new Date(cachedEntry.cachedAt).getTime();

				if (serverIsNewer) {
					cacheNoteSnapshot(remoteNote, remoteNote.content, false);
					applyLoadedNoteState(remoteNote);
				}
			} catch {
				if (!cachedNote && !cancelled) {
					setCurrentNoteState(null);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [applyLoadedNoteState, cacheNoteSnapshot, noteCache, persistSessionBoundaryVersion, setCurrentNoteState, state.activeNoteId, workspaceName]);

	// Listen for emoji picker trigger from sidebar context menu
	useEffect(() => {
		const handler = (e: Event) => {
			const custom = e as CustomEvent<{ noteId: string }>;
			if (custom.detail.noteId === state.activeNoteId) {
				setEmojiPickerOpen(true);
			}
		};
		window.addEventListener("open-emoji-picker", handler);
		return () => window.removeEventListener("open-emoji-picker", handler);
	}, [state.activeNoteId]);

	// Close emoji picker on outside click
	useEffect(() => {
		if (!emojiPickerOpen) return;
		const handler = (e: MouseEvent) => {
			if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(e.target as Node)) {
				setEmojiPickerOpen(false);
			}
		};
		window.addEventListener("mousedown", handler);
		return () => window.removeEventListener("mousedown", handler);
	}, [emojiPickerOpen]);

	const handleSaveContent = useCallback(
		async (content: unknown) => {
			if (!state.activeNoteId) return;

			const normalizedContent = normalizeBlockNoteContent(content);
			currentContentRef.current = normalizedContent;

			if (!isOnline) {
				queueOfflineContent(normalizedContent);
				setSaveStatus("offline");
				return;
			}

			setSaveStatus("saving");
			try {
				const updated = await persistNoteContent(state.activeNoteId, normalizedContent);
				const nextNote = updateCurrentNoteState((current) => ({
					...current,
					content: updated.content,
					updatedAt: updated.updatedAt ?? current.updatedAt,
				}));

				if (nextNote) {
					cacheNoteSnapshot(nextNote, updated.content, false);
				} else {
					noteCache.markClean(state.activeNoteId, updated.updatedAt);
				}

				markSaveSuccess();
			} catch {
				markSaveFailure();
			}
		},
		[
			cacheNoteSnapshot,
			isOnline,
			markSaveFailure,
			markSaveSuccess,
			noteCache,
			persistNoteContent,
			queueOfflineContent,
			state.activeNoteId,
			updateCurrentNoteState,
		],
	);

	const handleContentChange = useCallback(
		(content: unknown) => {
			const current = noteRef.current;
			if (!current) {
				return;
			}

			const normalizedContent = normalizeBlockNoteContent(content);
			currentContentRef.current = normalizedContent;

			const now = Date.now();
			lastEditAtRef.current = now;
			if (!hasEditsSinceVersionRef.current) {
				hasEditsSinceVersionRef.current = true;
				firstEditSinceVersionAtRef.current = now;
			}

			queueOfflineContent(normalizedContent);
			if (!isOnline) {
				setSaveStatus("offline");
			}
		},
		[isOnline, queueOfflineContent],
	);

	const handleSaveTitle = useCallback(
		async (title: string) => {
			if (!state.activeNoteId) return;
			setSaveStatus("saving");
			try {
				const updated = await patchActiveNote({ title });
				if (!updated) return;
				const nextNote = updateCurrentNoteState((current) => ({
					...current,
					title,
					updatedAt: updated.updatedAt ?? current.updatedAt,
				}));
				if (nextNote) {
					cacheNoteSnapshot(nextNote);
				}
				markSaveSuccess();
				onNoteCreated();
			} catch {
				markSaveFailure();
			}
		},
		[cacheNoteSnapshot, markSaveFailure, markSaveSuccess, onNoteCreated, patchActiveNote, state.activeNoteId, updateCurrentNoteState],
	);

	const handleEmojiChange = useCallback(
		async (emoji: string | null) => {
			if (!state.activeNoteId) return;
			setEmojiPickerOpen(false);
			try {
				const updated = await patchActiveNote({ emoji });
				if (updated) {
					const nextNote = updateCurrentNoteState((current) => ({
						...current,
						emoji,
						updatedAt: updated.updatedAt ?? current.updatedAt,
					}));
					if (nextNote) {
						cacheNoteSnapshot(nextNote);
					}
				}
			} catch {
				markSaveFailure();
			}
			onRefresh();
		},
		[cacheNoteSnapshot, markSaveFailure, onRefresh, patchActiveNote, state.activeNoteId, updateCurrentNoteState],
	);

	const handleCreateNote = async () => {
		const res = await fetch("/api/notes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId }),
		});
		if (res.ok) {
			const newNote = await res.json();
			onNoteCreated();
			setActiveNote(newNote.id);
			setIsNewNote(true);
		}
	};

	const handleDuplicate = useCallback(async () => {
		if (!note) return;
		const res = await fetch(`/api/notes/${note.id}`);
		if (!res.ok) return;
		const noteData = await res.json();
		const createRes = await fetch("/api/notes", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ workspaceId, folderId: noteData.folderId }),
		});
		if (createRes.ok) {
			const newNote = await createRes.json();
			await fetch(`/api/notes/${newNote.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					title: `${noteData.title} (copy)`,
					content: noteData.content,
					emoji: noteData.emoji,
				}),
			});

			const duplicatedCoverMeta = resolveNoteCoverMeta(noteData.coverImage, noteData.coverImageMeta);
			if (noteData.coverImage && duplicatedCoverMeta && duplicatedCoverMeta.source !== "upload") {
				await fetch(`/api/notes/${newNote.id}/cover`, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						coverImage: noteData.coverImage,
						coverImageMeta: duplicatedCoverMeta,
					}),
				});
			}

			onNoteCreated();
			onRefresh();
		}
	}, [note, workspaceId, onNoteCreated, onRefresh]);

	const handleDelete = useCallback(async () => {
		if (!note) return;
		await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
		setActiveNote(null);
		onRefresh();
	}, [note, setActiveNote, onRefresh]);

	const fetchVersions = useCallback(async (noteId: string, showLoading = true): Promise<NoteVersionSummary[]> => {
		if (!noteId) return [];
		if (showLoading) {
			setVersionsLoading(true);
		}

		try {
			const response = await fetch(`/api/notes/${noteId}/versions`);
			if (!response.ok) {
				throw new Error("Failed to load versions");
			}

			const data = (await response.json()) as { versions?: NoteVersionSummary[] };
			if (noteRef.current?.id === noteId) {
				const nextVersions = data.versions ?? [];
				setVersions(nextVersions);
				lastVersionCreatedAtRef.current = nextVersions[0] ? new Date(nextVersions[0].createdAt).getTime() : null;
				return nextVersions;
			}

			return data.versions ?? [];
		} catch {
			if (noteRef.current?.id === noteId) {
				setVersions([]);
				lastVersionCreatedAtRef.current = null;
			}

			return [];
		} finally {
			if (showLoading) {
				setVersionsLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		if (!state.activeNoteId || !isOnline) {
			return;
		}

		void fetchVersions(state.activeNoteId, false);
	}, [fetchVersions, isOnline, state.activeNoteId]);

	const handlePreviewVersion = useCallback(
		async (versionId: string) => {
			const current = noteRef.current;
			if (!current) {
				return;
			}

			if (previewVersionId === versionId && previewVersion && !previewLoading) {
				return;
			}

			setPreviewVersionId(versionId);
			setPreviewLoading(true);
			try {
				const response = await fetch(`/api/notes/${current.id}/versions/${versionId}`);
				if (!response.ok) {
					throw new Error("Failed to load version preview");
				}

				const data = (await response.json()) as NoteVersionDetail;
				if (noteRef.current?.id === current.id) {
					setPreviewVersion(data);
				}
			} catch {
				if (noteRef.current?.id === current.id) {
					setPreviewVersion(null);
				}
			} finally {
				if (noteRef.current?.id === current.id) {
					setPreviewLoading(false);
				}
			}
		},
		[previewLoading, previewVersion, previewVersionId],
	);

	const openVersionsDialog = useCallback(async () => {
		const current = noteRef.current;
		if (!current) {
			return;
		}

		setVersionsOpen(true);
		const nextVersions = await fetchVersions(current.id);

		if (nextVersions.length === 0) {
			setPreviewVersionId(null);
			setPreviewVersion(null);
			setPreviewLoading(false);
			return;
		}

		if (previewVersionId && previewVersion && nextVersions.some((version) => version.id === previewVersionId)) {
			return;
		}

		await handlePreviewVersion(nextVersions[0].id);
	}, [fetchVersions, handlePreviewVersion, previewVersion, previewVersionId]);

	const createVersion = useCallback(
		async (options: { manual: boolean; label?: string; content?: unknown }) => {
			const current = noteRef.current;
			if (!current || versionRequestInFlightRef.current) {
				return null;
			}

			const snapshotContent = normalizeBlockNoteContent(options.content ?? currentContentRef.current ?? current.content);
			if (!isOnline) {
				queueOfflineContent(snapshotContent);
				setSaveStatus("offline");
				return null;
			}

			versionRequestInFlightRef.current = true;
			try {
				const result = await createVersionRequest(current.id, {
					manual: options.manual,
					label: options.label,
					content: snapshotContent,
				});

				const nextNote = updateCurrentNoteState((existing) => ({
					...existing,
					content: result.note.content,
					updatedAt: result.note.updatedAt ?? existing.updatedAt,
				}));

				if (nextNote) {
					cacheNoteSnapshot(nextNote, result.note.content, false);
				} else {
					noteCache.markClean(current.id, result.note.updatedAt);
				}

				if (result.version) {
					const createdVersion = result.version;
					hasEditsSinceVersionRef.current = false;
					firstEditSinceVersionAtRef.current = null;
					lastVersionCreatedAtRef.current = new Date(createdVersion.createdAt).getTime();
					setVersions((previousVersions) =>
						[createdVersion, ...previousVersions.filter((version) => version.id !== createdVersion.id)].slice(0, NOTE_VERSION_LIMIT),
					);
				}

				return result;
			} catch {
				return null;
			} finally {
				versionRequestInFlightRef.current = false;
			}
		},
		[cacheNoteSnapshot, createVersionRequest, isOnline, noteCache, queueOfflineContent, updateCurrentNoteState],
	);

	const handleManualVersion = useCallback(async () => {
		const current = noteRef.current;
		if (!current) {
			return;
		}

		setIsCreatingManualVersion(true);
		setSaveStatus("saving");
		try {
			const result = await createVersion({
				manual: true,
				content: currentContentRef.current ?? current.content,
			});

			if (!result) {
				markSaveFailure();
				return;
			}

			markSaveSuccess();
			if (result.version) {
				setPreviewVersionId(result.version.id);
			}

			if (versionsOpen) {
				await fetchVersions(current.id, false);
			}
		} finally {
			setIsCreatingManualVersion(false);
		}
	}, [createVersion, fetchVersions, markSaveFailure, markSaveSuccess, versionsOpen]);

	const handleRestoreVersion = useCallback(
		async (versionId: string) => {
			const current = noteRef.current;
			if (!current) return;

			setRestoringVersionId(versionId);
			setSaveStatus("saving");
			try {
				const response = await fetch(`/api/notes/${current.id}/versions/${versionId}`);
				if (!response.ok) {
					throw new Error("Failed to load version");
				}

				const version = (await response.json()) as NoteVersionDetail;
				const result = await createVersion({
					manual: true,
					label: `Restored from ${format(new Date(version.createdAt), "PPP 'at' p")}`,
					content: version.content,
				});

				if (!result) {
					markSaveFailure();
					return;
				}

				setPreviewVersion(version);
				setPreviewVersionId(version.id);
				setEditorResetToken((token) => token + 1);
				markSaveSuccess();
				setVersionsOpen(false);
				await fetchVersions(current.id, false);
				onRefresh();
			} catch {
				markSaveFailure();
			} finally {
				setRestoringVersionId(null);
			}
		},
		[createVersion, fetchVersions, markSaveFailure, markSaveSuccess, onRefresh],
	);

	const handleCoverUpdated = useCallback(
		(updated: { coverImage: string | null; coverImageMeta: unknown; updatedAt: string }) => {
			const nextNote = updateCurrentNoteState((current) => ({
				...current,
				coverImage: updated.coverImage,
				coverImageMeta: updated.coverImageMeta,
				updatedAt: updated.updatedAt ?? current.updatedAt,
			}));

			if (nextNote) {
				cacheNoteSnapshot(nextNote);
			}

			markSaveSuccess();
			onRefresh();
		},
		[cacheNoteSnapshot, markSaveSuccess, onRefresh, updateCurrentNoteState],
	);

	const flushDirtyNotes = useCallback(async () => {
		if (!isOnline || syncInFlightRef.current) {
			return;
		}

		const dirtyNotes = noteCache.getDirtyNotes();
		if (dirtyNotes.length === 0) {
			return;
		}

		syncInFlightRef.current = true;
		setSaveStatus("syncing");
		try {
			for (const dirtyNote of dirtyNotes) {
				const updated = await persistNoteContent(dirtyNote.id, dirtyNote.content);
				noteCache.markClean(dirtyNote.id, updated.updatedAt);

				if (noteRef.current?.id === dirtyNote.id) {
					const nextNote = updateCurrentNoteState((current) => ({
						...current,
						content: updated.content,
						updatedAt: updated.updatedAt ?? current.updatedAt,
					}));
					if (nextNote) {
						cacheNoteSnapshot(nextNote, updated.content, false);
					}
				}
			}

			markSyncSuccess();
		} catch {
			markSaveFailure();
		} finally {
			syncInFlightRef.current = false;
		}
	}, [cacheNoteSnapshot, isOnline, markSaveFailure, markSyncSuccess, noteCache, persistNoteContent, updateCurrentNoteState]);

	useEffect(() => {
		void flushDirtyNotes();
	}, [flushDirtyNotes]);

	useEffect(() => {
		if (!state.activeNoteId) {
			return;
		}

		const interval = window.setInterval(() => {
			if (!isOnline || !hasEditsSinceVersionRef.current || versionRequestInFlightRef.current) {
				return;
			}

			const now = Date.now();
			const lastEditAt = lastEditAtRef.current;
			const idleExpired = typeof lastEditAt === "number" && now - lastEditAt >= NOTE_VERSION_IDLE_THRESHOLD_MS;
			const versionAnchor = lastVersionCreatedAtRef.current ?? firstEditSinceVersionAtRef.current;
			const intervalExpired = typeof versionAnchor === "number" && now - versionAnchor >= NOTE_VERSION_MAX_INTERVAL_MS;

			if (!idleExpired && !intervalExpired) {
				return;
			}

			void createVersion({
				manual: false,
				content: currentContentRef.current,
			});
		}, 30_000);

		return () => {
			window.clearInterval(interval);
		};
	}, [createVersion, isOnline, state.activeNoteId]);

	useEffect(() => {
		const handleBeforeUnload = () => {
			const current = noteRef.current;
			if (!current || !isOnline || !hasEditsSinceVersionRef.current) {
				return;
			}

			const snapshotContent = normalizeBlockNoteContent(currentContentRef.current ?? current.content);
			const autosavePayload = new Blob([JSON.stringify({ content: snapshotContent })], { type: "application/json" });
			const versionPayload = new Blob([JSON.stringify({ manual: false, content: snapshotContent })], { type: "application/json" });

			navigator.sendBeacon?.(`/api/notes/${current.id}/autosave`, autosavePayload);
			navigator.sendBeacon?.(`/api/notes/${current.id}/versions`, versionPayload);
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, [isOnline]);

	// Update undo/redo state periodically (editor can mount after async note load).
	useEffect(() => {
		const updateHistoryState = () => {
			if (!editorRef.current) {
				setCanUndo(false);
				setCanRedo(false);
				return;
			}

			try {
				setCanUndo(editorRef.current.canUndo());
				setCanRedo(editorRef.current.canRedo());
			} catch {
				setCanUndo(false);
				setCanRedo(false);
			}
		};

		updateHistoryState();
		const interval = setInterval(updateHistoryState, 100);
		return () => clearInterval(interval);
	}, [state.activeNoteId, note?.id]);

	const persistCurrentWidth = useCallback(
		async (nextWidth?: number) => {
			if (!state.activeNoteId) return;
			const width = Math.round(nextWidth ?? editorWidthDraftRef.current);
			setStoredNoteWidth(state.activeNoteId, width);
			const nextNote = updateCurrentNoteState((current) => ({
				...current,
				editorWidth: width,
			}));
			if (nextNote) {
				cacheNoteSnapshot(nextNote);
			}
		},
		[cacheNoteSnapshot, state.activeNoteId, updateCurrentNoteState],
	);

	useEffect(() => {
		if (!isResizing) {
			applyEditorWidth(editorWidth);
		}
	}, [applyEditorWidth, editorWidth, isResizing]);

	useEffect(() => {
		if (!isAiPanelResizing) {
			applyAiPanelWidth(aiPanelWidth);
		}
	}, [aiPanelWidth, applyAiPanelWidth, isAiPanelResizing]);

	useEffect(() => {
		if (aiPanelCloseTimeoutRef.current !== null) {
			clearTimeout(aiPanelCloseTimeoutRef.current);
			aiPanelCloseTimeoutRef.current = null;
		}

		if (aiPanelOpenFrameRef.current !== null) {
			cancelAnimationFrame(aiPanelOpenFrameRef.current);
			aiPanelOpenFrameRef.current = null;
		}

		if (isAIPanelOpen) {
			setIsAiPanelMounted(true);
			aiPanelOpenFrameRef.current = window.requestAnimationFrame(() => {
				aiPanelOpenFrameRef.current = null;
			});
			return () => {
				if (aiPanelOpenFrameRef.current !== null) {
					cancelAnimationFrame(aiPanelOpenFrameRef.current);
					aiPanelOpenFrameRef.current = null;
				}
			};
		}

		aiPanelCloseTimeoutRef.current = setTimeout(() => {
			setIsAiPanelMounted(false);
			aiPanelCloseTimeoutRef.current = null;
		}, 220);

		return () => {
			if (aiPanelCloseTimeoutRef.current !== null) {
				clearTimeout(aiPanelCloseTimeoutRef.current);
				aiPanelCloseTimeoutRef.current = null;
			}
		};
	}, [isAIPanelOpen]);

	useEffect(() => {
		if (!isResizing) return;

		const maxAllowedByViewport = Math.max(MIN_EDITOR_WIDTH, Math.min(MAX_EDITOR_WIDTH, Math.floor((window.innerWidth - 96) * 0.95)));

		const onMouseMove = (event: MouseEvent) => {
			const dx = event.clientX - resizeStartXRef.current;
			const nextWidth = Math.max(MIN_EDITOR_WIDTH, Math.min(maxAllowedByViewport, resizeStartWidthRef.current + dx * 2));

			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			animationFrameRef.current = window.requestAnimationFrame(() => {
				applyEditorWidth(nextWidth);
			});
		};

		const onMouseUp = () => {
			const committedWidth = editorWidthDraftRef.current;
			setIsResizing(false);
			setEditorWidth(committedWidth);
			void persistCurrentWidth(committedWidth);
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [applyEditorWidth, isResizing, persistCurrentWidth]);

	useEffect(() => {
		if (!isAiPanelResizing) {
			return;
		}

		const maxAllowedByViewport = Math.max(MIN_AI_PANEL_WIDTH, Math.min(MAX_AI_PANEL_WIDTH, Math.floor(window.innerWidth * 0.6)));

		const onMouseMove = (event: MouseEvent) => {
			const dx = event.clientX - aiPanelResizeStartXRef.current;
			const nextWidth = Math.max(MIN_AI_PANEL_WIDTH, Math.min(maxAllowedByViewport, aiPanelResizeStartWidthRef.current - dx));

			if (aiPanelAnimationFrameRef.current !== null) {
				cancelAnimationFrame(aiPanelAnimationFrameRef.current);
			}

			aiPanelAnimationFrameRef.current = window.requestAnimationFrame(() => {
				applyAiPanelWidth(nextWidth);
			});
		};

		const onMouseUp = () => {
			const committedWidth = aiPanelWidthDraftRef.current;
			setAiPanelWidth(committedWidth);
			setIsAiPanelResizing(false);
			setStoredAiPanelWidth(committedWidth);
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
			if (aiPanelAnimationFrameRef.current !== null) {
				cancelAnimationFrame(aiPanelAnimationFrameRef.current);
			}
		};
	}, [applyAiPanelWidth, isAiPanelResizing]);

	const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		resizeStartXRef.current = event.clientX;
		resizeStartWidthRef.current = editorWidthDraftRef.current;
		setIsResizing(true);
	};

	const startAiPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		aiPanelResizeStartXRef.current = event.clientX;
		aiPanelResizeStartWidthRef.current = aiPanelWidthDraftRef.current;
		setIsAiPanelResizing(true);
	};

	const handleAppendAiContent = useCallback((markdown: string) => {
		return editorRef.current?.appendMarkdownToEnd(markdown) ?? false;
	}, []);

	useEffect(() => {
		const handleGlobalUndoRedo = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) {
				return;
			}

			const key = event.key.toLowerCase();
			const isUndoShortcut = key === "z" && !event.shiftKey;
			const isRedoShortcut = (key === "z" && event.shiftKey) || key === "y";
			if (!isUndoShortcut && !isRedoShortcut) {
				return;
			}

			if (isTextEntryElement(event.target)) {
				return;
			}

			const editor = editorRef.current;
			if (!editor) {
				return;
			}

			if (isUndoShortcut && !editor.canUndo()) {
				return;
			}

			if (isRedoShortcut && !editor.canRedo()) {
				return;
			}

			event.preventDefault();
			event.stopImmediatePropagation();

			if (isUndoShortcut) {
				editor.undo();
				return;
			}

			editor.redo();
		};

		window.addEventListener("keydown", handleGlobalUndoRedo, true);
		return () => {
			window.removeEventListener("keydown", handleGlobalUndoRedo, true);
		};
	}, []);

	const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (!shouldStartCanvasMarquee(event)) {
			return;
		}

		event.preventDefault();
		marqueeSelectionKeyRef.current = "";
		marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY };
		editorRef.current?.beginBlockSelection(event.clientX, event.clientY);
		const initial = {
			startX: event.clientX,
			startY: event.clientY,
			currentX: event.clientX,
			currentY: event.clientY,
		};
		marqueeSelectionRef.current = initial;
		setMarqueeSelection(initial);
		setIsMarqueeActive(true);
	}, []);

	useEffect(() => {
		if (!isMarqueeActive) {
			return;
		}

		const edgeThreshold = 72;
		const maxScrollStep = 28;

		const commitSelection = (selection: MarqueeSelection) => {
			marqueeSelectionRef.current = selection;
			const nextSelectionKey = `${selection.startX}:${selection.startY}:${selection.currentX}:${selection.currentY}`;
			if (marqueeSelectionKeyRef.current !== nextSelectionKey) {
				marqueeSelectionKeyRef.current = nextSelectionKey;
				setMarqueeSelection(selection);
			}
			editorRef.current?.updateBlockSelection(selection.currentX, selection.currentY);
		};

		const scheduleSelectionCommit = (selection: MarqueeSelection) => {
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
			}

			marqueeSelectionFrameRef.current = window.requestAnimationFrame(() => {
				marqueeSelectionFrameRef.current = null;
				commitSelection(selection);
			});
		};

		const handlePointerMove = (event: PointerEvent) => {
			marqueePointerRef.current = { clientX: event.clientX, clientY: event.clientY };
			const current = marqueeSelectionRef.current;
			if (!current) return;

			scheduleSelectionCommit({
				...current,
				currentX: event.clientX,
				currentY: event.clientY,
			});
		};

		const handlePointerEnd = () => {
			marqueeSelectionRef.current = null;
			marqueePointerRef.current = null;
			marqueeSelectionKeyRef.current = "";
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
				marqueeSelectionFrameRef.current = null;
			}
			if (marqueeAutoScrollFrameRef.current !== null) {
				cancelAnimationFrame(marqueeAutoScrollFrameRef.current);
				marqueeAutoScrollFrameRef.current = null;
			}
			setMarqueeSelection(null);
			setIsMarqueeActive(false);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerEnd, { once: true });
		window.addEventListener("pointercancel", handlePointerEnd, { once: true });

		const handleScroll = () => {
			const sel = marqueeSelectionRef.current;
			if (sel) {
				editorRef.current?.updateBlockSelection(sel.currentX, sel.currentY, "scroll");
			}
		};

		const autoScrollSelection = () => {
			const selection = marqueeSelectionRef.current;
			const pointer = marqueePointerRef.current;
			const scrollContainer = mainScrollRef.current;

			if (selection && pointer && scrollContainer) {
				const containerRect = scrollContainer.getBoundingClientRect();
				let scrollDelta = 0;

				if (pointer.clientY < containerRect.top + edgeThreshold) {
					const distance = Math.max(0, containerRect.top + edgeThreshold - pointer.clientY);
					scrollDelta = -Math.max(4, Math.round((distance / edgeThreshold) * maxScrollStep));
				} else if (pointer.clientY > containerRect.bottom - edgeThreshold) {
					const distance = Math.max(0, pointer.clientY - (containerRect.bottom - edgeThreshold));
					scrollDelta = Math.max(4, Math.round((distance / edgeThreshold) * maxScrollStep));
				}

				if (scrollDelta !== 0) {
					scrollContainer.scrollBy({ top: scrollDelta, behavior: "auto" });
					editorRef.current?.updateBlockSelection(pointer.clientX, pointer.clientY, "scroll");
				}
			}

			marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollSelection);
		};

		const scrollContainer = mainScrollRef.current;
		scrollContainer?.addEventListener("scroll", handleScroll, { passive: true });
		marqueeAutoScrollFrameRef.current = window.requestAnimationFrame(autoScrollSelection);

		return () => {
			if (marqueeSelectionFrameRef.current !== null) {
				cancelAnimationFrame(marqueeSelectionFrameRef.current);
				marqueeSelectionFrameRef.current = null;
			}
			if (marqueeAutoScrollFrameRef.current !== null) {
				cancelAnimationFrame(marqueeAutoScrollFrameRef.current);
				marqueeAutoScrollFrameRef.current = null;
			}
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerEnd);
			window.removeEventListener("pointercancel", handlePointerEnd);
			scrollContainer?.removeEventListener("scroll", handleScroll);
		};
	}, [isMarqueeActive]);

	if (loading) {
		return (
			<div className="flex flex-1 items-center justify-center fade-in" style={{ backgroundColor: "var(--bg-app)" }}>
				<div
					className="h-5 w-5 animate-spin rounded-full border-2"
					style={{
						borderColor: "var(--text-tertiary)",
						borderTopColor: "transparent",
					}}
				/>
			</div>
		);
	}

	if (!note) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-4 fade-in" style={{ backgroundColor: "var(--bg-app)" }}>
				{!isSidebarOpen && (
					<button
						onClick={onToggleSidebar}
						className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
						title="Open sidebar (Ctrl+\)">
						<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
					</button>
				)}
				<div className="flex h-16 w-16 items-center justify-center rounded-2xl smooth-bg" style={{ backgroundColor: "var(--bg-surface)" }}>
					<FileText className="h-8 w-8" style={{ color: "var(--text-tertiary)" }} />
				</div>
				<div className="text-center">
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						Select a note or create a new one
					</p>
				</div>
				<button
					onClick={handleCreateNote}
					className="hover-scale mt-2 flex items-center gap-2 rounded-[var(--sn-radius-md)] px-4 py-2 text-sm transition-all duration-150"
					style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}
					onMouseEnter={(e) => {
						(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.25)";
					}}
					onMouseLeave={(e) => {
						(e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-muted)";
					}}>
					<Plus className="h-4 w-4" />
					Create your first note
				</button>
			</div>
		);
	}

	const marqueeRect = marqueeSelection ? getRectFromMarquee(marqueeSelection) : null;

	return (
		<div
			className="flex flex-1 overflow-hidden fade-in"
			style={{
				backgroundColor: "var(--bg-app)",
				transform: "none",
				transition: "none",
				willChange: "auto",
			}}>
			{/* Main editor area */}
			<div ref={mainScrollRef} className="flex flex-1 flex-col overflow-y-auto" style={{}}>
				{/* Note header bar */}
				<div className="flex h-9 shrink-0 items-center justify-between px-4" style={{ borderBottom: "1px solid var(--border-default)" }}>
					<div className="flex items-center gap-2">
						{!isSidebarOpen && (
							<button
								onClick={onToggleSidebar}
								className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
								title="Open sidebar (Ctrl+\)">
								<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
							</button>
						)}
						<div className="flex items-center gap-1 text-xs min-w-0" style={{ color: "var(--text-tertiary)" }}>
							<span
								className="min-w-0"
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									display: "inline-block",
									maxWidth: "calc(100vw - 280px)",
								}}>
								{workspaceName}
								{note.folder && <> / {note.folder.name}</>}
								<> / </>
								<span style={{ color: "var(--text-secondary)" }}>{note.title || "Untitled"}</span>
							</span>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<SaveIndicator status={saveStatus} />
						<button
							onClick={openVersionsDialog}
							className="flex h-6 items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 text-xs transition-colors duration-150 hover:bg-[#1a1a1a]"
							title="View note history">
							<History className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
							<span style={{ color: "var(--text-tertiary)" }}>History</span>
						</button>
						<button
							onClick={() => editorRef.current?.undo()}
							disabled={!canUndo}
							className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30"
							title="Undo (Ctrl+Z)">
							<Undo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
						</button>
						<button
							onClick={() => editorRef.current?.redo()}
							disabled={!canRedo}
							className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30"
							title="Redo (Ctrl+Y)">
							<Redo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
						</button>
						<button
							onClick={() => setIsAIPanelOpen((v) => !v)}
							className={`flex h-6 items-center gap-1 rounded-[var(--sn-radius-sm)] px-2 text-xs transition-colors duration-150 ${isAIPanelOpen ? "bg-[#1a1a1a]" : "hover:bg-[#1a1a1a]"}`}
							title="AI Assistant">
							<Sparkles className="h-3.5 w-3.5" style={{ color: isAIPanelOpen ? "var(--sn-accent)" : "var(--text-tertiary)" }} />
							<span style={{ color: isAIPanelOpen ? "var(--sn-accent)" : "var(--text-tertiary)" }}>AI</span>
						</button>
						<NoteActionsMenu
							type="note"
							align="end"
							onChangeIcon={() => setEmojiPickerOpen(true)}
							onDuplicate={handleDuplicate}
							onSaveVersion={() => void handleManualVersion()}
							saveVersionDisabled={isCreatingManualVersion || !isOnline}
							saveVersionLabel={isCreatingManualVersion ? "Saving..." : "Save version"}
							onDelete={handleDelete}
						/>
					</div>
				</div>

				{/* Note content */}
				<div
					className="mx-auto w-full flex-1 px-6 py-8"
					style={{ maxWidth: "100%", userSelect: marqueeSelection ? "none" : undefined }}
					onPointerDown={handleCanvasPointerDown}>
					<NoteCoverPanel noteId={note.id} coverImage={note.coverImage} coverImageMeta={note.coverImageMeta} onCoverUpdated={handleCoverUpdated} />

					{/* Emoji icon & title row */}
					<div className="mb-2 flex items-start gap-3">
						{/* Emoji selector button */}
						<div ref={emojiWrapperRef} className="relative mt-1 shrink-0">
							<button
								onClick={() => setEmojiPickerOpen((v) => !v)}
								className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius-md)] text-xl transition-colors duration-150 hover:bg-[#1a1a1a]"
								title="Change icon">
								{note.emoji ? <span>{note.emoji}</span> : <FileText className="h-5 w-5" style={{ color: "var(--text-tertiary)" }} />}
							</button>

							{/* Emoji picker popup */}
							{emojiPickerOpen && (
								<div
									className="absolute left-0 top-12 z-50 w-64 rounded-[var(--sn-radius-lg)] dropdown-enter"
									style={{
										backgroundColor: "var(--bg-hover)",
										border: "1px solid var(--border-strong)",
										boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
										maxHeight: "320px",
										display: "flex",
										flexDirection: "column",
									}}>
									<div
										className="overflow-y-auto p-2"
										style={{
											scrollbarWidth: "thin",
										}}>
										<div className="grid grid-cols-8 gap-0.5">
											{EMOJI_LIST.map((em, index) => (
												<button
													key={`${em}-${index}`}
													onClick={() => handleEmojiChange(em)}
													className="flex h-7 w-7 items-center justify-center rounded text-base transition-colors duration-100 hover:bg-[#1f1f1f]"
													title={em}>
													{em}
												</button>
											))}
										</div>
									</div>
									{note.emoji && (
										<div className="border-t px-2 py-1" style={{ borderColor: "var(--border-strong)" }}>
											<button
												onClick={() => handleEmojiChange(null)}
												className="w-full rounded py-1 text-xs transition-colors duration-100 hover:bg-[#1f1f1f]"
												style={{ color: "var(--text-tertiary)" }}>
												Remove icon
											</button>
										</div>
									)}
								</div>
							)}
						</div>

						<div className="min-w-0 flex-1">
							<NoteTitle initialTitle={note.title} onSave={handleSaveTitle} autoFocus={isNewNote} />
							<div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
								<div className="flex items-center gap-1">
									<CalendarClock className="h-3 w-3" />
									<span>Created {new Date(note.createdAt).toLocaleString()}</span>
								</div>
								<div className="flex items-center gap-1">
									<Clock3 className="h-3 w-3" />
									<span>Last edited {new Date(note.updatedAt).toLocaleString()}</span>
								</div>
							</div>
						</div>
					</div>

					<div
						ref={editorShellRef}
						className="group relative mt-2 mx-auto stacknote-editor-shell"
						style={{ width: `${editorWidth}px`, maxWidth: "100%" }}>
						<NoteEditor
							key={`${note.id}:${editorResetToken}`}
							ref={editorRef}
							workspaceId={workspaceId}
							noteId={note.id}
							initialContent={note.content}
							onContentChange={handleContentChange}
							onSave={handleSaveContent}
						/>
						<div
							onMouseDown={startResize}
							className="absolute bottom-0 right-[-3px] top-0 z-20 w-3 cursor-ew-resize rounded duration-150"
							style={{
								backgroundColor: isResizing ? "rgba(124, 106, 255, 0.2)" : "transparent",
								opacity: isResizing ? 1 : undefined,
							}}
							onMouseEnter={(e) => {
								if (!isResizing) {
									(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.16)";
								}
							}}
							onMouseLeave={(e) => {
								if (!isResizing) {
									(e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
								}
							}}
						/>
					</div>
				</div>

				<NoteVersionsDialog
					open={versionsOpen}
					currentContent={currentContentRef.current ?? note.content}
					currentTitle={note.title}
					currentEmoji={note.emoji ?? null}
					currentCoverImage={note.coverImage}
					currentCoverImageMeta={note.coverImageMeta}
					currentVersionId={null}
					versions={versions}
					loading={versionsLoading}
					previewVersionId={previewVersionId}
					previewVersion={previewVersion}
					previewLoading={previewLoading}
					restoringVersionId={restoringVersionId}
					onClose={() => setVersionsOpen(false)}
					onRefresh={() => {
						if (note.id) {
							void fetchVersions(note.id);
						}
					}}
					onPreview={handlePreviewVersion}
					onRestore={handleRestoreVersion}
				/>
			</div>

			{/* AI Side Panel */}
			<div
				ref={aiPanelRef}
				aria-hidden={!isAiPanelMounted}
				className="relative h-full shrink-0 overflow-hidden"
				style={{
					pointerEvents: isAiPanelMounted ? undefined : "none",
					backgroundColor: "var(--bg-sidebar)",
					width:
						typeof window !== "undefined" && window.innerWidth < 768 ? (isAiPanelMounted ? "100%" : 0) : isAiPanelMounted ? `${aiPanelWidth}px` : 0,
					opacity: isAiPanelMounted ? 1 : 0,
					transform: isAiPanelMounted ? "translateX(0)" : "translateX(12px)",
					transition: isAiPanelResizing ? "none" : "width 220ms ease, opacity 160ms linear, transform 220ms ease",
					willChange: "opacity, transform",
				}}>
				<div
					onMouseDown={startAiPanelResize}
					className={`${isAiPanelMounted ? "md:block" : "hidden"} absolute bottom-0 left-[-3px] top-0 z-30 w-3 cursor-ew-resize rounded duration-150`}
					style={{
						backgroundColor: isAiPanelResizing ? "rgba(124, 106, 255, 0.2)" : "transparent",
					}}
					onMouseEnter={(e) => {
						if (!isAiPanelResizing) {
							(e.currentTarget as HTMLElement).style.backgroundColor = "rgba(124, 106, 255, 0.16)";
						}
					}}
					onMouseLeave={(e) => {
						if (!isAiPanelResizing) {
							(e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
						}
					}}
				/>
				<AISidePanel
					workspaceId={workspaceId}
					noteId={note.id}
					noteTitle={note.title}
					noteContent={currentContentRef.current ?? note.content}
					onAppendToNote={handleAppendAiContent}
					isOpen={isAIPanelOpen}
					onClose={() => setIsAIPanelOpen(false)}
				/>
			</div>

			{marqueeRect && (
				<div
					className="pointer-events-none fixed z-40 stacknote-editor-selection-marquee"
					style={{
						left: marqueeRect.left,
						top: marqueeRect.top,
						width: marqueeRect.width,
						height: marqueeRect.height,
					}}
				/>
			)}
		</div>
	);
}
