/* eslint-disable react-hooks/rules-of-hooks */

"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Sparkles, Loader2 } from "lucide-react";
import { createReactBlockSpec, BlockContentWrapper } from "@blocknote/react";
import { toast } from "sonner";
import { UsageIndicator } from "@/components/ai/UsageIndicator";
import { usePreviewMode } from "@/components/editor/blocks/PreviewModeContext";
import { readErrorMessage, readJsonResponse } from "@/lib/http";
import { notifyAiUsageChanged } from "@/lib/ai-usage-events";
import { DEFAULT_STT_MODEL, isValidSttModel } from "@/lib/groq-models";

function formatSeconds(seconds: number) {
	if (!Number.isFinite(seconds)) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseTranscriptBlockIds(value: string): string[] {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
	} catch {
		return [];
	}
}

function splitTranscriptIntoParagraphs(transcript: string): string[] {
	const normalized = transcript.replace(/\r\n?/g, "\n").trim();
	if (!normalized) {
		return [];
	}

	const paragraphs = normalized
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter(Boolean);

	return paragraphs.length > 0 ? paragraphs : [normalized];
}

export const audioMediaBlockSpec = createReactBlockSpec(
	{
		type: "audioMedia",
		propSchema: {
			url: { default: "" },
			fileId: { default: "" },
			filename: { default: "" },
			duration: { default: undefined, type: "number" as const },
			uploading: { default: false, type: "boolean" as const },
			progress: { default: 0, type: "number" as const },
			error: { default: "" },
			transcriptBlockIds: { default: "" },
		},
		content: "none",
	},
	{
		meta: {
			fileBlockAccept: ["audio/*"],
		},
		render: (props) => {
			const audioRef = useRef<HTMLAudioElement>(null);
			const [isPlaying, setIsPlaying] = useState(false);
			const [currentTime, setCurrentTime] = useState(0);
			const [duration, setDuration] = useState(props.block.props.duration ?? 0);
			const [volume, setVolume] = useState(0.8);
			const [showVolume, setShowVolume] = useState(false);
			const [isTranscribing, setIsTranscribing] = useState(false);
			const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
			const [sttModel, setSttModel] = useState(DEFAULT_STT_MODEL);
			const lastNonZeroVolumeRef = useRef(0.8);
			const isPreview = usePreviewMode();
			const transcriptBlockIds = parseTranscriptBlockIds(props.block.props.transcriptBlockIds);
			const hasTranscript = transcriptBlockIds.length > 0;

			useEffect(() => {
				let mounted = true;

				async function loadPreferredTranscriptionModel() {
					try {
						const response = await fetch("/api/settings");
						const result = await readJsonResponse<{ preferredSttModel?: string }>(response);
						if (!mounted || !response.ok || !result?.preferredSttModel || !isValidSttModel(result.preferredSttModel)) {
							return;
						}

						setSttModel(result.preferredSttModel);
					} catch {
						// Keep the default model badge if settings are unavailable.
					}
				}

				void loadPreferredTranscriptionModel();

				return () => {
					mounted = false;
				};
			}, []);

			const handleTranscribe = useCallback(async () => {
				if (isTranscribing || !props.block.props.url) return;

				setIsTranscribing(true);
				setTranscriptionError(null);

				try {
					// Fetch the audio file from the URL
					const audioResponse = await fetch(props.block.props.url);
					if (!audioResponse.ok) {
						throw new Error("Failed to fetch audio file");
					}

					const audioBlob = await audioResponse.blob();
					const audioFile = new File([audioBlob], props.block.props.filename || "audio.mp3", { type: audioBlob.type || "audio/mpeg" });

					// Create form data for the transcription API
					const formData = new FormData();
					formData.append("audio", audioFile);
					formData.append("noteTitle", props.block.props.filename || "Audio Transcription");

					// Call the transcription API
					const response = await fetch("/api/ai/transcribe", {
						method: "POST",
						body: formData,
					});

					if (!response.ok) {
						throw new Error(await readErrorMessage(response, "Transcription failed"));
					}

					const result = await readJsonResponse<{ transcript?: string }>(response);
					if (!result) {
						throw new Error("Transcription returned an empty response");
					}

					const transcript = result.transcript?.trim() ?? "";
					const paragraphs = splitTranscriptIntoParagraphs(transcript);
					if (paragraphs.length === 0) {
						throw new Error("Transcription returned an empty transcript");
					}

					const existingTranscriptBlocks = parseTranscriptBlockIds(props.block.props.transcriptBlockIds)
						.map((blockId) => props.editor.getBlock(blockId))
						.filter((block): block is NonNullable<typeof block> => block !== undefined);

					if (existingTranscriptBlocks.length > 0) {
						props.editor.removeBlocks(existingTranscriptBlocks);
					}

					const insertedBlocks = props.editor.insertBlocks(
						[
							{
								type: "heading",
								props: { level: 2 },
								content: "Transcript",
							},
							...paragraphs.map((paragraph) => ({
								type: "paragraph" as const,
								content: paragraph,
							})),
						] as unknown as Parameters<typeof props.editor.insertBlocks>[0],
						props.block,
						"after",
					);

					props.editor.updateBlock(props.block, {
						type: "audioMedia",
						props: {
							...props.block.props,
							transcriptBlockIds: JSON.stringify(insertedBlocks.map((block) => block.id)),
						},
					});

					notifyAiUsageChanged();
					toast.success("Transcription complete");
				} catch (error) {
					setTranscriptionError(error instanceof Error ? error.message : "Transcription failed");
					toast.error("Transcription failed. Please try again.");
				} finally {
					setIsTranscribing(false);
				}
			}, [isTranscribing, props]);

			if (isPreview) {
				return (
					<BlockContentWrapper
						blockType={props.block.type}
						blockProps={props.block.props}
						propSchema={props.editor.schema.blockSchema.audioMedia.propSchema}>
						<div
							className="flex w-full items-center gap-3 rounded-[var(--sn-radius-lg)] border px-3 py-3"
							style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}>
							<div
								className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
								style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}>
								<Play className="h-4 w-4" />
							</div>

							<div className="min-w-0 flex-1">
								<div className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
									{props.block.props.filename || "Audio"}
								</div>
								<div className="mt-2 h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
							</div>

							<div className="w-20 shrink-0 text-right text-xs" style={{ color: "var(--text-secondary)" }}>
								0:00 / {formatSeconds(duration)}
							</div>
						</div>
					</BlockContentWrapper>
				);
			}

			useEffect(() => {
				const audio = audioRef.current;
				if (!audio) return;

				const onTimeUpdate = () => setCurrentTime(audio.currentTime);
				const onLoaded = () => {
					setDuration(audio.duration);
					props.editor.updateBlock(props.block, {
						type: "audioMedia",
						props: {
							...props.block.props,
							duration: Number.isFinite(audio.duration) ? audio.duration : undefined,
						},
					});
				};
				const onPlay = () => setIsPlaying(true);
				const onPause = () => setIsPlaying(false);
				const onEnded = () => setIsPlaying(false);

				audio.addEventListener("timeupdate", onTimeUpdate);
				audio.addEventListener("loadedmetadata", onLoaded);
				audio.addEventListener("play", onPlay);
				audio.addEventListener("pause", onPause);
				audio.addEventListener("ended", onEnded);

				return () => {
					audio.removeEventListener("timeupdate", onTimeUpdate);
					audio.removeEventListener("loadedmetadata", onLoaded);
					audio.removeEventListener("play", onPlay);
					audio.removeEventListener("pause", onPause);
					audio.removeEventListener("ended", onEnded);
				};
			}, [props]);

			const progress = useMemo(() => {
				if (!duration) return 0;
				return Math.min(100, (currentTime / duration) * 100);
			}, [currentTime, duration]);

			const togglePlayback = async () => {
				const audio = audioRef.current;
				if (!audio) return;

				if (audio.paused) {
					await audio.play();
				} else {
					audio.pause();
				}
			};

			return (
				<BlockContentWrapper
					blockType={props.block.type}
					blockProps={props.block.props}
					propSchema={props.editor.schema.blockSchema.audioMedia.propSchema}>
					<div
						className="group flex w-full flex-col gap-3 rounded-[var(--sn-radius-lg)] border px-3 py-3"
						style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
						onMouseEnter={() => setShowVolume(true)}
						onMouseLeave={() => setShowVolume(false)}>
						<audio ref={audioRef} src={props.block.props.url} preload="metadata" />

						<div className="flex min-w-0 items-center gap-3 md:hidden">
							<button
								type="button"
								onClick={togglePlayback}
								className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
								style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
								{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
							</button>

							<div className="min-w-0 flex-1">
								<div className="truncate text-xs leading-4 text-[var(--text-secondary)]">{props.block.props.filename || "Audio"}</div>
							</div>
						</div>

						<div className="relative h-1.5 w-full rounded-full md:hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
							<div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }} />
							<input
								type="range"
								min={0}
								max={duration || 0}
								value={Math.min(currentTime, duration || 0)}
								onChange={(event) => {
									const next = Number(event.target.value);
									setCurrentTime(next);
									if (audioRef.current) audioRef.current.currentTime = next;
								}}
								className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 touch-none"
							/>
						</div>

						<div className="flex flex-col items-center gap-2 text-center md:hidden">
							<div className="text-xs" style={{ color: "var(--text-secondary)" }}>
								{formatSeconds(currentTime)} / {formatSeconds(duration)}
							</div>
							<UsageIndicator model={sttModel} category="voice" variant="mobile" />
							<div className="flex items-center justify-center gap-2">
								<button
									type="button"
									onClick={handleTranscribe}
									disabled={isTranscribing || !props.block.props.url}
									className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#1a1a1a] disabled:opacity-50"
									style={{ color: transcriptionError ? "#ef4444" : "var(--text-tertiary)" }}
									title={transcriptionError || (hasTranscript ? "Reapply transcription" : "Transcribe audio with AI")}>
									{isTranscribing ? (
										<>
											<Loader2 className="h-3 w-3 animate-spin" />
											<span>Transcribing...</span>
										</>
									) : (
										<>
											<Sparkles className="h-3 w-3" />
											<span>{hasTranscript ? "Re-transcribe" : "Transcribe"}</span>
										</>
									)}
								</button>
								<button
									type="button"
									onClick={() => {
										const nextVolume = volume > 0 ? 0 : lastNonZeroVolumeRef.current || 0.8;
										setVolume(nextVolume);
										if (audioRef.current) audioRef.current.volume = nextVolume;
									}}
									className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#1a1a1a]"
									style={{ color: "var(--text-tertiary)" }}
									title={volume > 0 ? "Mute audio" : "Unmute audio"}>
									{volume > 0 ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
									<span>{volume > 0 ? "Mute" : "Unmute"}</span>
								</button>
							</div>
						</div>

						<div className="hidden min-w-0 items-center gap-3 md:flex">
							<button
								type="button"
								onClick={togglePlayback}
								className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
								style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
								{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
							</button>

							<div className="min-w-0 flex-1">
								<div className="truncate text-xs leading-4 text-[var(--text-secondary)]">{props.block.props.filename || "Audio"}</div>
								<div className="relative mt-1 h-1.5 w-full rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
									<div
										className="absolute left-0 top-0 h-full rounded-full"
										style={{ width: `${progress}%`, backgroundColor: "var(--sn-accent)" }}
									/>
									<input
										type="range"
										min={0}
										max={duration || 0}
										value={Math.min(currentTime, duration || 0)}
										onChange={(event) => {
											const next = Number(event.target.value);
											setCurrentTime(next);
											if (audioRef.current) audioRef.current.currentTime = next;
										}}
										className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
									/>
								</div>
							</div>

							<div className="w-20 shrink-0 whitespace-nowrap text-right text-xs" style={{ color: "var(--text-secondary)" }}>
								{formatSeconds(currentTime)} / {formatSeconds(duration)}
							</div>

							<div
								className={`hidden items-center gap-2 overflow-hidden transition-all duration-150 md:flex ${showVolume ? "w-24 opacity-100" : "w-0 opacity-0"}`}>
								{volume === 0 ? (
									<VolumeX className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
								) : (
									<Volume2 className="h-3.5 w-3.5" style={{ color: "var(--text-tertiary)" }} />
								)}
								<input
									type="range"
									min={0}
									max={1}
									step={0.01}
									value={volume}
									onChange={(event) => {
										const next = Number(event.target.value);
										setVolume(next);
										if (next > 0) {
											lastNonZeroVolumeRef.current = next;
										}
										if (audioRef.current) audioRef.current.volume = next;
									}}
									className="h-1.5 w-16 cursor-pointer appearance-none rounded-full"
									style={{
										background: `linear-gradient(to right, var(--sn-accent) ${Math.round(volume * 100)}%, rgba(255,255,255,0.08) ${Math.round(volume * 100)}%)`,
									}}
								/>
							</div>

							<div className="flex shrink-0 flex-col items-end gap-1">
								<button
									type="button"
									onClick={handleTranscribe}
									disabled={isTranscribing || !props.block.props.url}
									className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#1a1a1a] disabled:opacity-50"
									style={{ color: transcriptionError ? "#ef4444" : "var(--text-tertiary)" }}
									title={transcriptionError || (hasTranscript ? "Reapply transcription" : "Transcribe audio with AI")}>
									{isTranscribing ? (
										<>
											<Loader2 className="h-3 w-3 animate-spin" />
											<span>Transcribing...</span>
										</>
									) : (
										<>
											<Sparkles className="h-3 w-3" />
											<span>{hasTranscript ? "Re-transcribe" : "Transcribe"}</span>
										</>
									)}
								</button>
								<UsageIndicator model={sttModel} category="voice" />
							</div>
						</div>
					</div>
				</BlockContentWrapper>
			);
		},
	},
);
