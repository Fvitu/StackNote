"use client";

import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type EmojiSelection = {
	emoji: string;
};

const EmojiPickerClient = dynamic(
	async () => {
		const emojiPickerModule = await import("emoji-picker-react");
		const EmojiPicker = emojiPickerModule.default;

		return function NoteEmojiPicker(props: { onEmojiClick: (emojiData: EmojiSelection) => void }) {
			return (
				<EmojiPicker
					onEmojiClick={props.onEmojiClick}
					theme={emojiPickerModule.Theme.DARK}
					emojiStyle={emojiPickerModule.EmojiStyle.APPLE}
					autoFocusSearch
					lazyLoadEmojis
					searchPlaceholder="Search note icon"
					previewConfig={{ showPreview: false }}
					width="100%"
					height={360}
					style={{ width: "100%", border: 0, boxShadow: "none" }}
				/>
			);
		};
	},
	{ ssr: false },
);

interface NoteIconPickerDialogProps {
	open: boolean;
	noteTitle: string;
	emoji: string | null;
	onOpenChange: (open: boolean) => void;
	onEmojiSelect: (emoji: string | null) => Promise<void> | void;
}

export function NoteIconPickerDialog({ open, noteTitle, emoji, onOpenChange, onEmojiSelect }: NoteIconPickerDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent centered className="border border-white/10 bg-[#111111] text-white sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Choose note icon</DialogTitle>
					<DialogDescription className="text-zinc-400">Update the icon for {noteTitle || "Untitled"}.</DialogDescription>
				</DialogHeader>
				<div className="rounded-2xl border border-white/5 bg-[#141414] p-2">
					<EmojiPickerClient
						onEmojiClick={(emojiData) => {
							void onEmojiSelect(emojiData.emoji);
						}}
					/>
				</div>
				<DialogFooter className="border-white/5 bg-[#111111]">
					{emoji ? (
						<Button
							type="button"
							variant="outline"
							className="border-white/10 bg-[#141414] text-zinc-200 hover:bg-white/5"
							onClick={() => {
								void onEmojiSelect(null);
							}}>
							Remove icon
						</Button>
					) : null}
					<DialogClose render={<Button variant="outline" className="border-white/10 bg-[#141414] text-zinc-200 hover:bg-white/5" />}>Close</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}