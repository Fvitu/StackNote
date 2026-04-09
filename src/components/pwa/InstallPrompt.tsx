"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_STORAGE_KEY = "stacknote:pwa-install-dismissed";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
};

export function InstallPrompt() {
	const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const isDismissed = window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
		if (isDismissed) {
			return;
		}

		const handleBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setInstallEvent(event as BeforeInstallPromptEvent);
			setIsVisible(true);
		};

		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		};
	}, []);

	if (!isVisible || !installEvent) {
		return null;
	}

	return (
		<div className="fixed inset-x-0 top-0 z-[110] flex justify-center px-4 pt-4">
			<div
				className="flex w-full max-w-2xl items-center gap-3 rounded-[var(--sn-radius-lg)] border px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.34)]"
				style={{
					backgroundColor: "var(--bg-surface)",
					borderColor: "var(--border-strong)",
					transform: "translateY(0)",
					animation: "stacknote-install-slide 300ms ease",
				}}>
				<div
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
					style={{ backgroundColor: "var(--accent-muted)", color: "var(--sn-accent)" }}>
					<Download className="h-4 w-4" />
				</div>

				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
						Install StackNote for offline access
					</p>
					<p className="text-xs" style={{ color: "var(--text-secondary)" }}>
						Add it to your device so your notes and study tools stay one tap away.
					</p>
				</div>

				<button
					type="button"
					onClick={async () => {
						await installEvent.prompt();
						const result = await installEvent.userChoice;
						if (result.outcome === "accepted") {
							setIsVisible(false);
							setInstallEvent(null);
							return;
						}
						window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
						setIsVisible(false);
						setInstallEvent(null);
					}}
					className="rounded-[var(--sn-radius-md)] px-3 py-2 text-sm font-medium transition-colors"
					style={{ backgroundColor: "var(--sn-accent)", color: "#ffffff" }}>
					Install
				</button>

				<button
					type="button"
					onClick={() => {
						window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
						setIsVisible(false);
						setInstallEvent(null);
					}}
					className="flex h-8 w-8 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors hover:bg-[var(--bg-hover)]"
					aria-label="Dismiss install prompt">
					<X className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
				</button>
			</div>

			<style jsx>{`
				@keyframes stacknote-install-slide {
					from {
						opacity: 0;
						transform: translateY(-16px);
					}
					to {
						opacity: 1;
						transform: translateY(0);
					}
				}
			`}</style>
		</div>
	);
}
