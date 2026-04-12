"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_STORAGE_KEY = "stacknote_pwa_dismissed";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{
		outcome: "accepted" | "dismissed";
		platform: string;
	}>;
};

function isIosSafariInstallable() {
	if (typeof navigator === "undefined") {
		return false;
	}

	const ua = navigator.userAgent.toLowerCase();
	const isIos = /iphone|ipad|ipod/i.test(ua);
	const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return isIos && !isStandalone;
}

function isStandaloneInstalled() {
	if (typeof window === "undefined") {
		return false;
	}

	const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return isStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function ShareIcon() {
	return (
		<svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 text-[#d0d0d0]">
			<path
				fill="currentColor"
				d="M10 2a1 1 0 0 1 1 1v6.2l1.9-1.9a1 1 0 0 1 1.4 1.4l-3.6 3.6a1 1 0 0 1-1.4 0L5.7 8.7a1 1 0 1 1 1.4-1.4L9 9.2V3a1 1 0 0 1 1-1Zm-5 11a1 1 0 0 0-1 1v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2a1 1 0 1 0-2 0v2H6v-2a1 1 0 0 0-1-1Z"
			/>
		</svg>
	);
}

export function InstallPrompt() {
	const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
	const [dismissed, setDismissed] = useState(false);
	const [isIosPrompt, setIsIosPrompt] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const persistedDismiss = window.localStorage.getItem(DISMISS_STORAGE_KEY) === "true";
		setDismissed(persistedDismiss);

		const handleInstalled = () => {
			window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
			setDismissed(true);
		};

		const handleBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			setInstallEvent(event as BeforeInstallPromptEvent);
		};

		setIsIosPrompt(isIosSafariInstallable());
		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleInstalled);
		return () => {
			window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
			window.removeEventListener("appinstalled", handleInstalled);
		};
	}, []);

	const shouldRender = useMemo(() => {
		if (dismissed || isStandaloneInstalled()) {
			return false;
		}
		return Boolean(installEvent) || isIosPrompt;
	}, [dismissed, installEvent, isIosPrompt]);

	if (!shouldRender) {
		return null;
	}

	return (
		<div className="fixed inset-x-0 bottom-4 z-[170] flex justify-center px-4">
			<div className="relative flex w-full max-w-2xl flex-col gap-3 rounded-[var(--sn-radius-lg)] border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 pr-12 shadow-[0_18px_50px_rgba(0,0,0,0.34)] sm:flex-row sm:items-start sm:gap-4 sm:pr-4">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1b1830] text-[#7c6aff]">
						{installEvent ? <Download className="h-4 w-4" /> : <ShareIcon />}
					</div>

					<div className="min-w-0 flex-1">
						{installEvent ? (
							<>
								<p className="text-sm font-medium text-[#f1f1f1]">Install StackNote</p>
								<p className="text-xs text-[#b9b9b9]">Add StackNote to your home screen for an app-like experience with offline support.</p>
							</>
						) : (
							<>
								<p className="text-sm font-medium text-[#f1f1f1]">Add to your Home Screen - tap Share (↑) then Add to Home Screen</p>
								<p className="text-xs text-[#b9b9b9]">You'll get a full-screen experience that works offline.</p>
							</>
						)}
					</div>
				</div>

				{installEvent ? (
					<button
						type="button"
						onClick={async () => {
							await installEvent.prompt();
							const result = await installEvent.userChoice;
							if (result.outcome === "accepted") {
								return;
							}
							window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
							setDismissed(true);
						}}
						className="w-full rounded-[var(--sn-radius-md)] bg-[#7c6aff] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6f5af0] sm:w-auto sm:self-center">
						Install StackNote
					</button>
				) : null}

				<button
					type="button"
					onClick={() => {
						window.localStorage.setItem(DISMISS_STORAGE_KEY, "true");
						setDismissed(true);
					}}
					className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors hover:bg-[#1b1b1b]"
					aria-label="Dismiss install prompt">
					<X className="h-4 w-4 text-[#8d8d8d]" />
				</button>
			</div>
		</div>
	);
}
