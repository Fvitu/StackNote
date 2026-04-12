"use client";

import { useEffect, useMemo, useRef } from "react";

type SaveFunction<TArgs extends unknown[]> = (...args: TArgs) => Promise<void> | void;

export function useDebouncedSave<TArgs extends unknown[]>(saveFn: SaveFunction<TArgs>, delayMs: number) {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const latestArgsRef = useRef<TArgs | null>(null);

	const api = useMemo(() => {
		const flush = async () => {
			if (!latestArgsRef.current) {
				return;
			}

			const args = latestArgsRef.current;
			latestArgsRef.current = null;
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
				timeoutRef.current = null;
			}
			await saveFn(...args);
		};

		return {
			push: (...args: TArgs) => {
				latestArgsRef.current = args;
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
				timeoutRef.current = setTimeout(() => {
					void flush();
				}, delayMs);
			},
			flush,
			cancel: () => {
				latestArgsRef.current = null;
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
					timeoutRef.current = null;
				}
			},
		};
	}, [delayMs, saveFn]);

	useEffect(() => {
		return () => {
			void api.flush();
			api.cancel();
		};
	}, [api]);

	return api;
}
