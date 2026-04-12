"use client";

import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function findScrollParent(element: HTMLElement): HTMLElement | null {
	let current: HTMLElement | null = element.parentElement;

	while (current) {
		const style = window.getComputedStyle(current);
		if (/(auto|scroll|overlay)/.test(style.overflowY)) {
			return current;
		}

		current = current.parentElement;
	}

	return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

interface ScrollRevealBarProps {
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	revealOnScroll?: boolean;
}

export function ScrollRevealBar({ children, className, style, revealOnScroll = false }: ScrollRevealBarProps) {
	const rootRef = useRef<HTMLDivElement | null>(null);
	const lastScrollTopRef = useRef<number | null>(null);
	const frameRef = useRef<number | null>(null);
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		if (!revealOnScroll) {
			setIsVisible(true);
			return;
		}

		const root = rootRef.current;
		if (!root) {
			return;
		}

		const scrollParent = findScrollParent(root);
		if (!scrollParent) {
			return;
		}

		const updateVisibility = () => {
			const currentScrollTop = scrollParent.scrollTop;
			const lastScrollTop = lastScrollTopRef.current;

			if (lastScrollTop === null) {
				lastScrollTopRef.current = currentScrollTop;
				setIsVisible(currentScrollTop <= 8);
				return;
			}

			const scrollDelta = currentScrollTop - lastScrollTop;
			lastScrollTopRef.current = currentScrollTop;

			if (currentScrollTop <= 8) {
				setIsVisible(true);
				return;
			}

			if (scrollDelta > 4) {
				setIsVisible(false);
				return;
			}

			if (scrollDelta < -4) {
				setIsVisible(true);
			}
		};

		const handleScroll = () => {
			if (frameRef.current !== null) {
				return;
			}

			frameRef.current = window.requestAnimationFrame(() => {
				frameRef.current = null;
				updateVisibility();
			});
		};

		updateVisibility();
		scrollParent.addEventListener("scroll", handleScroll, { passive: true });

		return () => {
			scrollParent.removeEventListener("scroll", handleScroll);
			if (frameRef.current !== null) {
				window.cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
		};
	}, [revealOnScroll]);

	return (
		<div
			ref={rootRef}
			className={cn(
				"sticky top-0 z-30 transform-gpu",
				revealOnScroll ? "transition-[transform,opacity] duration-300 ease-out will-change-transform" : null,
				revealOnScroll ? (isVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0") : "translate-y-0 opacity-100",
				className,
			)}
			style={style}>
			{children}
		</div>
	);
}