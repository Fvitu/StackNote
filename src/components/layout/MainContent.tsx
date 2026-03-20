"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  FileText,
  Plus,
  Expand,
  Shrink,
  PanelLeftOpen,
  Undo2,
  Redo2,
} from "lucide-react"
import { NoteEditor, type NoteEditorRef } from "@/components/editor/NoteEditor"
import { NoteTitle } from "@/components/editor/NoteTitle"
import { SaveIndicator } from "@/components/editor/SaveIndicator"
import { useWorkspace } from "@/contexts/WorkspaceContext"
import { NoteActionsMenu } from "@/components/layout/NoteActionsMenu"

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
  id: string
  title: string
  emoji?: string | null
  content: unknown
  workspace: { name: string }
  folder: { name: string } | null
}

export function MainContent({
  workspaceId,
  workspaceName,
  onNoteCreated,
  onRefresh,
  isSidebarOpen,
  onToggleSidebar,
}: MainContentProps) {
  const { state, setActiveNote, setFullscreen } = useWorkspace()
  const [note, setNote] = useState<NoteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [isNewNote, setIsNewNote] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const emojiWrapperRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<NoteEditorRef>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  useEffect(() => {
    if (!state.activeNoteId) {
      setNote(null)
      return
    }
    setLoading(true)
    fetch(`/api/notes/${state.activeNoteId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load note")
        return res.json()
      })
      .then((data) => {
        setNote(data)
        setIsNewNote(data.title === "Untitled" && !data.content)
      })
      .catch(() => setNote(null))
      .finally(() => setLoading(false))
  }, [state.activeNoteId])

  // Listen for emoji picker trigger from sidebar context menu
  useEffect(() => {
    const handler = (e: Event) => {
      const custom = e as CustomEvent<{ noteId: string }>
      if (custom.detail.noteId === state.activeNoteId) {
        setEmojiPickerOpen(true)
      }
    }
    window.addEventListener("open-emoji-picker", handler)
    return () => window.removeEventListener("open-emoji-picker", handler)
  }, [state.activeNoteId])

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (
        emojiWrapperRef.current &&
        !emojiWrapperRef.current.contains(e.target as Node)
      ) {
        setEmojiPickerOpen(false)
      }
    }
    window.addEventListener("mousedown", handler)
    return () => window.removeEventListener("mousedown", handler)
  }, [emojiPickerOpen])

  const handleSaveContent = useCallback(
    async (content: unknown) => {
      if (!state.activeNoteId) return
      setSaveStatus("saving")
      try {
        await fetch(`/api/notes/${state.activeNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        })
        setSaveStatus("saved")
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000)
      } catch {
        setSaveStatus("error")
      }
    },
    [state.activeNoteId]
  )

  const handleSaveTitle = useCallback(
    async (title: string) => {
      if (!state.activeNoteId) return
      setSaveStatus("saving")
      try {
        await fetch(`/api/notes/${state.activeNoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        })
        setSaveStatus("saved")
        onNoteCreated()
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = setTimeout(() => setSaveStatus("idle"), 3000)
      } catch {
        setSaveStatus("error")
      }
    },
    [state.activeNoteId, onNoteCreated]
  )

  const handleEmojiChange = useCallback(
    async (emoji: string | null) => {
      if (!state.activeNoteId) return
      setNote((prev) => prev ? { ...prev, emoji } : prev)
      setEmojiPickerOpen(false)
      await fetch(`/api/notes/${state.activeNoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      })
      onRefresh()
    },
    [state.activeNoteId, onRefresh]
  )

  const handleCreateNote = async () => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    })
    if (res.ok) {
      const newNote = await res.json()
      onNoteCreated()
      setActiveNote(newNote.id)
      setIsNewNote(true)
    }
  }

  const handleDuplicate = useCallback(async () => {
    if (!note) return
    const res = await fetch(`/api/notes/${note.id}`)
    if (!res.ok) return
    const noteData = await res.json()
    const createRes = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, folderId: noteData.folderId }),
    })
    if (createRes.ok) {
      const newNote = await createRes.json()
      await fetch(`/api/notes/${newNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${noteData.title} (copy)`,
          content: noteData.content,
          emoji: noteData.emoji,
        }),
      })
      onNoteCreated()
      onRefresh()
    }
  }, [note, workspaceId, onNoteCreated, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!note) return
    await fetch(`/api/notes/${note.id}`, { method: "DELETE" })
    setActiveNote(null)
    onRefresh()
  }, [note, setActiveNote, onRefresh])

  // Keyboard: Escape to exit fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.isFullscreen) {
        setFullscreen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [state.isFullscreen, setFullscreen])

  // Update undo/redo state periodically
  useEffect(() => {
    if (!editorRef.current) return
    const interval = setInterval(() => {
      if (editorRef.current) {
        setCanUndo(editorRef.current.canUndo())
        setCanRedo(editorRef.current.canRedo())
      }
    }, 100)
    return () => clearInterval(interval)
  }, [state.activeNoteId])

  if (loading) {
    return (
      <div
        className="flex flex-1 items-center justify-center fade-in"
        style={{ backgroundColor: "var(--bg-app)" }}
      >
        <div
          className="h-5 w-5 animate-spin rounded-full border-2"
          style={{
            borderColor: "var(--text-tertiary)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    )
  }

  if (!note) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-4 fade-in"
        style={{ backgroundColor: "var(--bg-app)" }}
      >
        {!isSidebarOpen && (
          <button
            onClick={onToggleSidebar}
            className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
            title="Open sidebar (Ctrl+\)"
          >
            <PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
          </button>
        )}
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl smooth-bg"
          style={{ backgroundColor: "var(--bg-surface)" }}
        >
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
            ;(e.currentTarget as HTMLElement).style.backgroundColor =
              "rgba(124, 106, 255, 0.25)"
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-muted)"
          }}
        >
          <Plus className="h-4 w-4" />
          Create your first note
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex flex-1 flex-col overflow-y-auto fade-in"
      style={{ backgroundColor: "var(--bg-app)" }}
    >
      {/* Note header bar */}
      {!state.isFullscreen && (
        <div
          className="flex h-9 shrink-0 items-center justify-between px-4"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center gap-2">
            {!isSidebarOpen && (
              <button
                onClick={onToggleSidebar}
                className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
                title="Open sidebar (Ctrl+\)"
              >
                <PanelLeftOpen
                  className="h-4 w-4"
                  style={{ color: "var(--text-tertiary)" }}
                />
              </button>
            )}
            <div
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--text-tertiary)" }}
            >
              <span>{workspaceName}</span>
              {note.folder && (
                <>
                  <span>/</span>
                  <span>{note.folder.name}</span>
                </>
              )}
              <span>/</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {note.title || "Untitled"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SaveIndicator status={saveStatus} />
            <button
              onClick={() => editorRef.current?.undo()}
              disabled={!canUndo}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
            </button>
            <button
              onClick={() => editorRef.current?.redo()}
              disabled={!canRedo}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a] disabled:opacity-30"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
            </button>
            <button
              onClick={() => setFullscreen(true)}
              className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
              title="Full screen (Esc to exit)"
            >
              <Expand className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
            </button>
            <NoteActionsMenu
              type="note"
              align="end"
              onChangeIcon={() => setEmojiPickerOpen(true)}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </div>
        </div>
      )}

      {/* Fullscreen exit button */}
      {state.isFullscreen && (
        <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
          <SaveIndicator status={saveStatus} />
          <button
            onClick={() => setFullscreen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-[var(--sn-radius-md)] transition-colors duration-150"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-tertiary)",
            }}
            title="Exit full screen (Esc)"
          >
            <Shrink className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Note content */}
      <div
        className="mx-auto w-full flex-1 px-6 py-8"
        style={{ maxWidth: state.isFullscreen ? "860px" : "720px" }}
      >
        {/* Emoji icon & title row */}
        <div className="mb-2 flex items-start gap-3">
          {/* Emoji selector button */}
          <div ref={emojiWrapperRef} className="relative mt-1 shrink-0">
            <button
              onClick={() => setEmojiPickerOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-[var(--sn-radius-md)] text-xl transition-colors duration-150 hover:bg-[#1a1a1a]"
              title="Change icon"
            >
              {note.emoji ? (
                <span>{note.emoji}</span>
              ) : (
                <FileText
                  className="h-5 w-5"
                  style={{ color: "var(--text-tertiary)" }}
                />
              )}
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
                }}
              >
                <div
                  className="overflow-y-auto p-2"
                  style={{
                    scrollbarWidth: "thin",
                  }}
                >
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJI_LIST.map((em) => (
                      <button
                        key={em}
                        onClick={() => handleEmojiChange(em)}
                        className="flex h-7 w-7 items-center justify-center rounded text-base transition-colors duration-100 hover:bg-[#1f1f1f]"
                        title={em}
                      >
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
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      Remove icon
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <NoteTitle
              initialTitle={note.title}
              onSave={handleSaveTitle}
              autoFocus={isNewNote}
            />
          </div>
        </div>

        <div className="mt-2">
          <NoteEditor
            ref={editorRef}
            noteId={note.id}
            initialContent={note.content}
            onSave={handleSaveContent}
          />
        </div>
      </div>
    </div>
  )
}
