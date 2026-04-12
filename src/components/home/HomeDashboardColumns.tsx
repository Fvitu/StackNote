"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface HomeDashboardColumnsProps {
	left: ReactNode;
	right: ReactNode;
}

export function HomeDashboardColumns({ left, right }: HomeDashboardColumnsProps) {
	const rightColumnRef = useRef<HTMLDivElement | null>(null);
	const [rightColumnHeight, setRightColumnHeight] = useState<number | null>(null);
	const [shouldSyncColumnHeight, setShouldSyncColumnHeight] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const largeScreenQuery = window.matchMedia("(min-width: 1024px)");
		const updateShouldSyncHeight = () => {
			setShouldSyncColumnHeight(largeScreenQuery.matches);
		};

		updateShouldSyncHeight();

		if (typeof largeScreenQuery.addEventListener === "function") {
			largeScreenQuery.addEventListener("change", updateShouldSyncHeight);
			return () => largeScreenQuery.removeEventListener("change", updateShouldSyncHeight);
		}

		largeScreenQuery.addListener(updateShouldSyncHeight);
		return () => largeScreenQuery.removeListener(updateShouldSyncHeight);
	}, []);

	useEffect(() => {
		const element = rightColumnRef.current;
		if (!element) {
			return;
		}

		const updateHeight = () => {
			setRightColumnHeight(element.getBoundingClientRect().height);
		};

		updateHeight();

		if (typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", updateHeight);
			return () => window.removeEventListener("resize", updateHeight);
		}

		const observer = new ResizeObserver(updateHeight);
		observer.observe(element);
		window.addEventListener("resize", updateHeight);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", updateHeight);
		};
	}, []);

	return (
		<div className="grid min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)] lg:items-start">
			<div className="min-w-0 overflow-hidden" style={shouldSyncColumnHeight && rightColumnHeight ? { height: `${rightColumnHeight}px` } : undefined}>
				{left}
			</div>
			<div ref={rightColumnRef} className="min-w-0 space-y-6">
				{right}
			</div>
		</div>
	);
}