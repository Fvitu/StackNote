"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
	return <div className={cn("stacknote-skeleton rounded-md bg-[#111111]", className)} style={style} aria-hidden="true" />;
}
