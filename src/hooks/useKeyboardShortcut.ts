"use client";

import { useEffect } from "react";

interface ShortcutOptions {
	metaOrCtrl?: boolean;
	preventDefault?: boolean;
}

export function useKeyboardShortcut(key: string, handler: () => void, options: ShortcutOptions = { metaOrCtrl: true, preventDefault: true }) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const keyMatches = event.key.toLowerCase() === key.toLowerCase();
			if (!keyMatches) return;

			if (options.metaOrCtrl && !(event.metaKey || event.ctrlKey)) return;

			if (options.preventDefault) {
				event.preventDefault();
			}

			handler();
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [handler, key, options.metaOrCtrl, options.preventDefault]);
}
