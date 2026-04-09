"use client";

export type HomeQuickAction = "new-note" | "new-folder" | "upload-file";

const HOME_QUICK_ACTION_EVENT = "stacknote:home-quick-action";

export function dispatchHomeQuickAction(action: HomeQuickAction) {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new CustomEvent<HomeQuickAction>(HOME_QUICK_ACTION_EVENT, { detail: action }));
}

export function subscribeToHomeQuickActions(listener: (action: HomeQuickAction) => void) {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	const handleEvent = (event: Event) => {
		const customEvent = event as CustomEvent<HomeQuickAction>;
		if (!customEvent.detail) {
			return;
		}

		listener(customEvent.detail);
	};

	window.addEventListener(HOME_QUICK_ACTION_EVENT, handleEvent);
	return () => {
		window.removeEventListener(HOME_QUICK_ACTION_EVENT, handleEvent);
	};
}
