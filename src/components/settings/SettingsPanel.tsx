"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Mic, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { FLASHCARD_MODEL_LIMITS, QUIZ_MODEL_LIMITS, STT_MODEL_LIMITS, TEXT_MODEL_LIMITS, formatDurationSeconds } from "@/lib/ai-limits";
import { subscribeToAiUsageChanges } from "@/lib/ai-usage-events";
import { formatUsageResetCountdown } from "@/lib/ai-usage";
import { readJsonResponse } from "@/lib/http";
import { STT_MODELS, TEXT_MODELS } from "@/lib/groq-models";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface UsageStats {
	textModels: UsageModelStats[];
	flashcardModels: UsageModelStats[];
	quizModels: UsageModelStats[];
	voiceModels: UsageModelStats[];
}

interface CounterStat {
	used: number;
	limit: number;
	remaining: number;
}

interface UsageModelStats {
	category: "text" | "flashcard" | "quiz" | "voice";
	model: string;
	label: string;
	windowStartedAt: string | null;
	resetAt: string | null;
	requests: CounterStat;
	tokens?: CounterStat;
	flashcards?: CounterStat;
	questions?: CounterStat;
	audioSeconds?: CounterStat;
}

interface UserSettings {
	preferredTextModel: string;
	preferredSttModel: string;
}

interface SettingsPanelProps {
	variant: "page" | "dock";
	onClose?: () => void;
}

interface ModelOption {
	id: string;
	name: string;
	default?: boolean;
}

function metricPercentage(metric: CounterStat) {
	return metric.limit > 0 ? (metric.used / metric.limit) * 100 : 0;
}

function UsageSkeleton() {
	return (
		<div className="space-y-4" aria-hidden="true">
			{["Text Models", "Study Templates", "Voice Models"].map((title) => (
				<div
					key={title}
					className="rounded-lg border p-4 animate-pulse"
					style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
					<div className="mb-3 h-4 w-24 rounded bg-[rgba(255,255,255,0.08)]" />
					<div className="space-y-3">
						<div className="rounded-md border p-3" style={{ borderColor: "var(--border-default)" }}>
							<div className="mb-3 flex items-start justify-between gap-3">
								<div className="min-w-0 flex-1 space-y-2">
									<div className="h-4 w-32 rounded bg-[rgba(255,255,255,0.08)]" />
									<div className="h-3 w-48 rounded bg-[rgba(255,255,255,0.06)]" />
								</div>
								<div className="w-28 space-y-2 text-right">
									<div className="ml-auto h-3 w-full rounded bg-[rgba(255,255,255,0.08)]" />
									<div className="ml-auto h-3 w-4/5 rounded bg-[rgba(255,255,255,0.08)]" />
									<div className="ml-auto h-3 w-3/4 rounded bg-[rgba(255,255,255,0.08)]" />
								</div>
							</div>

							<div className="space-y-2">
								<div className="h-5 rounded-full bg-[rgba(255,255,255,0.06)]" />
								<div className="h-5 w-11/12 rounded-full bg-[rgba(255,255,255,0.06)]" />
								<div className="h-5 w-10/12 rounded-full bg-[rgba(255,255,255,0.06)]" />
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}

function SettingsHeader({ variant, onClose }: SettingsPanelProps) {
	if (variant === "page") {
		return (
			<Link
				href="/"
				className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-[#1a1a1a]"
				style={{ color: "var(--text-secondary)" }}>
				<ArrowLeft className="h-4 w-4" />
				Back
			</Link>
		);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={onClose}
					className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-[#1a1a1a]"
					style={{ color: "var(--text-secondary)" }}
					aria-label="Close">
					<X className="h-4 w-4" />
					Close
				</button>
			</TooltipTrigger>
			<TooltipContent>Close</TooltipContent>
		</Tooltip>
	);
}

function ModelDropdown({
	options,
	value,
	onChange,
	disabled,
	placeholder,
}: {
	options: readonly ModelOption[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	placeholder?: string;
}) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) {
			return;
		}

		const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};

		document.addEventListener("mousedown", handleOutsideClick);
		document.addEventListener("touchstart", handleOutsideClick);
		document.addEventListener("keydown", handleEscape);

		return () => {
			document.removeEventListener("mousedown", handleOutsideClick);
			document.removeEventListener("touchstart", handleOutsideClick);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open]);

	const selectedOption = options.find((option) => option.id === value);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-50"
				style={{
					borderColor: "var(--border-default)",
					color: "var(--text-primary)",
					backgroundColor: "var(--bg-surface)",
				}}>
				<span className="truncate">{selectedOption ? `${selectedOption.name}${selectedOption.default ? " (Default)" : ""}` : placeholder}</span>
				<ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--text-secondary)" }} />
			</button>

			{open ? (
				<div
					role="listbox"
					className="absolute z-30 mt-2 w-full overflow-hidden rounded-md border shadow-lg"
					style={{
						borderColor: "var(--border-default)",
						backgroundColor: "var(--bg-surface)",
					}}>
					<div className="max-h-56 overflow-y-auto py-1">
						{options.map((option) => {
							const isSelected = option.id === value;
							return (
								<button
									key={option.id}
									type="button"
									role="option"
									aria-selected={isSelected}
									onClick={() => {
										setOpen(false);
										if (!isSelected) {
											onChange(option.id);
										}
									}}
									className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-[rgba(255,255,255,0.05)]"
									style={{ color: "var(--text-primary)" }}>
									<span className="min-w-0 truncate">
										{option.name} {option.default ? "(Default)" : ""}
									</span>
									{isSelected ? <Check className="h-4 w-4 shrink-0" style={{ color: "var(--sn-accent)" }} /> : null}
								</button>
							);
						})}
					</div>
				</div>
			) : null}
		</div>
	);
}

export function SettingsPanel({ variant, onClose }: SettingsPanelProps) {
	const [settings, setSettings] = useState<UserSettings>({
		preferredTextModel: "openai/gpt-oss-120b",
		preferredSttModel: "whisper-large-v3",
	});
	const [usage, setUsage] = useState<UsageStats | null>(null);
	const [loadingSettings, setLoadingSettings] = useState(true);
	const [loadingUsage, setLoadingUsage] = useState(true);
	const [saving, setSaving] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		async function fetchSettings() {
			try {
				const response = await fetch("/api/settings");
				const data = await readJsonResponse<UserSettings>(response);
				if (response.ok && data) {
					setSettings(data);
				}
			} catch (error) {
				console.error("Failed to fetch settings:", error);
			} finally {
				setLoadingSettings(false);
			}
		}

		void fetchSettings();
	}, []);

	useEffect(() => {
		async function fetchUsage() {
			try {
				const response = await fetch("/api/ai/usage");
				const data = await readJsonResponse<UsageStats>(response);
				if (response.ok && data) {
					setUsage(data);
				}
			} catch (error) {
				console.error("Failed to fetch usage:", error);
			} finally {
				setLoadingUsage(false);
			}
		}

		void fetchUsage();
		const interval = window.setInterval(() => {
			void fetchUsage();
		}, 30000);

		const unsubscribe = subscribeToAiUsageChanges(() => {
			void fetchUsage();
		});

		return () => {
			window.clearInterval(interval);
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		const interval = window.setInterval(() => {
			setNow(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(interval);
		};
	}, []);

	const handleSave = async (field: keyof UserSettings, value: string) => {
		setSaving(true);
		try {
			const response = await fetch("/api/settings", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ [field]: value }),
			});
			if (response.ok) {
				setSettings((prev) => ({ ...prev, [field]: value }));
				if (field === "preferredTextModel") {
					const selectedModel = TEXT_MODELS.find((model) => model.id === value)?.name ?? value;
					toast.success(`Model updated to ${selectedModel}`);
				} else {
					toast.success("Settings saved");
				}
			} else {
				toast.error("Failed to save settings");
			}
		} catch (error) {
			console.error("Failed to save settings:", error);
			toast.error("Failed to save settings");
		} finally {
			setSaving(false);
		}
	};

	const rootClassName = variant === "dock" ? "flex h-full min-h-0 flex-col overflow-hidden" : "flex h-full min-h-0 flex-col overflow-y-auto";
	const contentClassName = variant === "dock" ? "flex-1 min-h-0 overflow-y-auto px-4 py-6" : "mx-auto w-full max-w-2xl px-6 py-8";

	const studyTemplateUsageItems = useMemo<UsageModelStats[]>(() => {
		if (!usage) {
			return [];
		}

		const modelIds = Array.from(new Set([...usage.flashcardModels.map((item) => item.model), ...usage.quizModels.map((item) => item.model)]));

		return modelIds.map((modelId) => {
			const flashcardUsage = usage.flashcardModels.find((item) => item.model === modelId);
			const quizUsage = usage.quizModels.find((item) => item.model === modelId);
			const flashcardLimit = FLASHCARD_MODEL_LIMITS[modelId as keyof typeof FLASHCARD_MODEL_LIMITS];
			const quizLimit = QUIZ_MODEL_LIMITS[modelId as keyof typeof QUIZ_MODEL_LIMITS];

			const requestLimit = Math.max(flashcardLimit?.requestsPerWindow ?? 0, quizLimit?.requestsPerWindow ?? 0);
			const sharedRequests = flashcardUsage?.requests ??
				quizUsage?.requests ?? {
					used: 0,
					limit: requestLimit,
					remaining: Math.max(0, requestLimit),
				};

			const flashcardCounter = flashcardUsage?.flashcards ?? {
				used: 0,
				limit: flashcardLimit?.flashcardsPerWindow ?? 0,
				remaining: flashcardLimit?.flashcardsPerWindow ?? 0,
			};

			const questionCounter = quizUsage?.questions ?? {
				used: 0,
				limit: quizLimit?.questionsPerWindow ?? 0,
				remaining: quizLimit?.questionsPerWindow ?? 0,
			};

			return {
				category: "flashcard",
				model: modelId,
				label: flashcardUsage?.label ?? quizUsage?.label ?? modelId,
				windowStartedAt: flashcardUsage?.windowStartedAt ?? quizUsage?.windowStartedAt ?? null,
				resetAt: flashcardUsage?.resetAt ?? quizUsage?.resetAt ?? null,
				requests: sharedRequests,
				flashcards: flashcardCounter,
				questions: questionCounter,
			};
		});
	}, [usage]);

	return (
		<div className={rootClassName} style={{ backgroundColor: variant === "dock" ? "var(--bg-sidebar)" : "var(--bg-app)" }}>
			<div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-6" style={{ borderColor: "var(--border-default)" }}>
				<h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
					Settings
				</h1>
				<SettingsHeader variant={variant} onClose={onClose} />
			</div>

			<div className={contentClassName}>
				<section className="mb-8">
					<div className="mb-4 flex items-center gap-2">
						<Sparkles className="h-5 w-5" style={{ color: "var(--sn-accent)" }} />
						<h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
							AI Settings
						</h2>
					</div>

					<div className="mb-4 rounded-lg border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
						<label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							Preferred Text Model
						</label>
						<p className="mb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
							The AI model used for chat and text generation
						</p>
						<ModelDropdown
							options={TEXT_MODELS}
							value={settings.preferredTextModel}
							onChange={(value) => handleSave("preferredTextModel", value)}
							disabled={loadingSettings || saving}
							placeholder="Choose a text model"
						/>
						<p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
							{TEXT_MODELS.find((model) => model.id === settings.preferredTextModel)?.description}
						</p>
					</div>

					<div className="rounded-lg border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
						<label className="mb-2 flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
							<Mic className="h-4 w-4" />
							Preferred Transcription Model
						</label>
						<p className="mb-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
							Audio transcription uses your selected Whisper model
						</p>
						<ModelDropdown
							options={STT_MODELS}
							value={settings.preferredSttModel}
							onChange={(value) => handleSave("preferredSttModel", value)}
							disabled={loadingSettings || saving}
							placeholder="Choose a transcription model"
						/>
						<p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
							{STT_MODELS.find((model) => model.id === settings.preferredSttModel)?.description}
						</p>
					</div>
				</section>

				<section>
					<h2 className="mb-4 text-base font-medium" style={{ color: "var(--text-primary)" }}>
						24-Hour Usage
					</h2>

					{loadingUsage ? (
						<UsageSkeleton />
					) : usage ? (
						<div className="space-y-4">
							{[
								{ title: "Text Models", items: usage.textModels },
								{ title: "Study Templates", items: studyTemplateUsageItems, isStudyTemplates: true },
								{ title: "Voice Models", items: usage.voiceModels },
							].map((group) => (
								<div
									key={group.title}
									className="rounded-lg border p-4"
									style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
									<h3 className="mb-3 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
										{group.title}
									</h3>
									<div className="space-y-3">
										{group.items.map((item) => {
											const isStudyTemplates = group.isStudyTemplates === true;
											const flashcardMetric =
												item.flashcards ??
												(isStudyTemplates
													? {
															used: 0,
															limit:
																FLASHCARD_MODEL_LIMITS[item.model as keyof typeof FLASHCARD_MODEL_LIMITS]
																	?.flashcardsPerWindow ?? 0,
															remaining:
																FLASHCARD_MODEL_LIMITS[item.model as keyof typeof FLASHCARD_MODEL_LIMITS]
																	?.flashcardsPerWindow ?? 0,
														}
													: null);
											const questionMetric =
												item.questions ??
												(isStudyTemplates
													? {
															used: 0,
															limit: QUIZ_MODEL_LIMITS[item.model as keyof typeof QUIZ_MODEL_LIMITS]?.questionsPerWindow ?? 0,
															remaining: QUIZ_MODEL_LIMITS[item.model as keyof typeof QUIZ_MODEL_LIMITS]?.questionsPerWindow ?? 0,
														}
													: null);
											const secondaryMetric = isStudyTemplates
												? null
												: (item.tokens ?? item.flashcards ?? item.questions ?? item.audioSeconds ?? null);
											const secondaryLabel = isStudyTemplates
												? null
												: item.tokens
													? "Tokens"
													: item.flashcards
														? "Flashcards"
														: item.questions
															? "Questions"
															: item.audioSeconds
																? "Audio"
																: null;

											return (
												<div
													key={`${item.category}-${item.model}`}
													className="rounded-md border p-3"
													style={{ borderColor: "var(--border-default)" }}>
													<div className="mb-2 flex items-start justify-between gap-3">
														<div>
															<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
																{item.label}
															</p>
															<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
																{item.resetAt
																	? `Window resets in ${formatUsageResetCountdown(item.resetAt, now)}`
																	: "Window starts on the first request."}
															</p>
														</div>
														<div className="text-right text-xs" style={{ color: "var(--text-secondary)" }}>
															<div>
																Total requests: {item.requests.used} / {item.requests.limit}
															</div>
															{isStudyTemplates ? (
																<>
																	<div>
																		Flashcards: {flashcardMetric?.used ?? 0} / {flashcardMetric?.limit ?? 0}
																	</div>
																	<div>
																		Questions: {questionMetric?.used ?? 0} / {questionMetric?.limit ?? 0}
																	</div>
																</>
															) : (
																<>
																	{item.tokens ? (
																		<div>
																			Tokens: {item.tokens.used.toLocaleString()} / {item.tokens.limit.toLocaleString()}
																		</div>
																	) : null}
																	{item.flashcards ? (
																		<div>
																			Flashcards: {item.flashcards.used} / {item.flashcards.limit}
																		</div>
																	) : null}
																	{item.questions ? (
																		<div>
																			Questions: {item.questions.used} / {item.questions.limit}
																		</div>
																	) : null}
																	{item.audioSeconds ? (
																		<div>
																			Audio: {formatDurationSeconds(item.audioSeconds.used)} /{" "}
																			{formatDurationSeconds(item.audioSeconds.limit)}
																		</div>
																	) : null}
																</>
															)}
														</div>
													</div>

													<div className="space-y-2">
														<div>
															<div className="mb-1 flex items-center justify-between text-xs">
																<span style={{ color: "var(--text-secondary)" }}>Total requests</span>
																<span style={{ color: "var(--text-primary)" }}>
																	{item.requests.used} / {item.requests.limit}
																</span>
															</div>
															<div
																className="h-2 w-full overflow-hidden rounded-full"
																style={{ backgroundColor: "var(--bg-hover)" }}>
																<div
																	className="h-full transition-all"
																	style={{
																		width: `${metricPercentage(item.requests)}%`,
																		backgroundColor: "var(--sn-accent)",
																	}}
																/>
															</div>
														</div>

														{isStudyTemplates ? (
															<>
																<div>
																	<div className="mb-1 flex items-center justify-between text-xs">
																		<span style={{ color: "var(--text-secondary)" }}>Flashcards</span>
																		<span style={{ color: "var(--text-primary)" }}>
																			{flashcardMetric?.used ?? 0} / {flashcardMetric?.limit ?? 0}
																		</span>
																	</div>
																	<div
																		className="h-2 w-full overflow-hidden rounded-full"
																		style={{ backgroundColor: "var(--bg-hover)" }}>
																		<div
																			className="h-full transition-all"
																			style={{
																				width: `${metricPercentage(flashcardMetric ?? { used: 0, limit: 1, remaining: 1 })}%`,
																				backgroundColor: "var(--sn-accent)",
																			}}
																		/>
																	</div>
																</div>

																<div>
																	<div className="mb-1 flex items-center justify-between text-xs">
																		<span style={{ color: "var(--text-secondary)" }}>Questions</span>
																		<span style={{ color: "var(--text-primary)" }}>
																			{questionMetric?.used ?? 0} / {questionMetric?.limit ?? 0}
																		</span>
																	</div>
																	<div
																		className="h-2 w-full overflow-hidden rounded-full"
																		style={{ backgroundColor: "var(--bg-hover)" }}>
																		<div
																			className="h-full transition-all"
																			style={{
																				width: `${metricPercentage(questionMetric ?? { used: 0, limit: 1, remaining: 1 })}%`,
																				backgroundColor: "var(--sn-accent)",
																			}}
																		/>
																	</div>
																</div>
															</>
														) : null}

														{secondaryMetric && secondaryLabel ? (
															<div>
																<div className="mb-1 flex items-center justify-between text-xs">
																	<span style={{ color: "var(--text-secondary)" }}>{secondaryLabel}</span>
																	<span style={{ color: "var(--text-primary)" }}>
																		{item.tokens
																			? `${secondaryMetric.used.toLocaleString()} / ${secondaryMetric.limit.toLocaleString()}`
																			: item.flashcards
																				? `${secondaryMetric.used} / ${secondaryMetric.limit}`
																				: item.questions
																					? `${secondaryMetric.used} / ${secondaryMetric.limit}`
																					: `${formatDurationSeconds(secondaryMetric.used)} / ${formatDurationSeconds(secondaryMetric.limit)}`}
																	</span>
																</div>
																<div
																	className="h-2 w-full overflow-hidden rounded-full"
																	style={{ backgroundColor: "var(--bg-hover)" }}>
																	<div
																		className="h-full transition-all"
																		style={{
																			width: `${metricPercentage(secondaryMetric)}%`,
																			backgroundColor: "var(--sn-accent)",
																		}}
																	/>
																</div>
															</div>
														) : null}
													</div>
												</div>
											);
										})}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
							Failed to load usage stats
						</p>
					)}
				</section>

				<section className="mt-8">
					<h2 className="mb-4 text-base font-medium" style={{ color: "var(--text-primary)" }}>
						Daily Limits
					</h2>
					<div className="rounded-lg border p-4" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-default)" }}>
						<div className="space-y-4 text-sm" style={{ color: "var(--text-secondary)" }}>
							<div>
								<p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
									Text models
								</p>
								<div className="space-y-1">
									{Object.entries(TEXT_MODEL_LIMITS).map(([modelId, limit]) => (
										<p key={modelId}>
											<strong style={{ color: "var(--text-primary)" }}>{limit.label}</strong>: {limit.requestsPerWindow} requests and{" "}
											{limit.tokensPerWindow.toLocaleString()} tokens
										</p>
									))}
								</div>
							</div>

							<div>
								<p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
									Study templates (Flashcards + Quiz)
								</p>
								<div className="space-y-2">
									{Array.from(new Set([...Object.keys(FLASHCARD_MODEL_LIMITS), ...Object.keys(QUIZ_MODEL_LIMITS)])).map((modelId) => {
										const flashcardLimit = FLASHCARD_MODEL_LIMITS[modelId as keyof typeof FLASHCARD_MODEL_LIMITS];
										const quizLimit = QUIZ_MODEL_LIMITS[modelId as keyof typeof QUIZ_MODEL_LIMITS];
										const label = flashcardLimit?.label ?? quizLimit?.label ?? modelId;
										const requestLimit = Math.max(flashcardLimit?.requestsPerWindow ?? 0, quizLimit?.requestsPerWindow ?? 0);

										return (
											<div key={modelId} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--border-default)" }}>
												<p>
													<strong style={{ color: "var(--text-primary)" }}>{label}</strong>
												</p>
												<p>Total requests: {requestLimit}</p>
												<p>Flashcards: {flashcardLimit?.flashcardsPerWindow ?? 0}</p>
												<p>Questions: {quizLimit?.questionsPerWindow ?? 0}</p>
											</div>
										);
									})}
								</div>
							</div>

							<div>
								<p className="mb-2 font-medium" style={{ color: "var(--text-primary)" }}>
									Voice models
								</p>
								<div className="space-y-1">
									{Object.entries(STT_MODEL_LIMITS).map(([modelId, limit]) => (
										<p key={modelId}>
											<strong style={{ color: "var(--text-primary)" }}>{limit.label}</strong>: {limit.requestsPerWindow} requests and{" "}
											{formatDurationSeconds(limit.audioSecondsPerWindow)} of audio
										</p>
									))}
								</div>
							</div>
						</div>
						<p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
							Each model uses its own rolling 24-hour window. The countdown starts when you make the first request for that model.
						</p>
					</div>
				</section>
			</div>
		</div>
	);
}
