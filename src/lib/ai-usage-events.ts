const AI_USAGE_UPDATED_EVENT = "stacknote:ai-usage-updated";

export function notifyAiUsageChanged() {
	if (typeof window === "undefined") {
		return;
	}

	window.dispatchEvent(new CustomEvent(AI_USAGE_UPDATED_EVENT));
}

export function subscribeToAiUsageChanges(listener: () => void) {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	window.addEventListener(AI_USAGE_UPDATED_EVENT, listener);
	return () => {
		window.removeEventListener(AI_USAGE_UPDATED_EVENT, listener);
	};
}
