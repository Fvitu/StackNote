"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbSegment {
	label: string;
	href: string;
	isCurrent?: boolean;
}

export function Breadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
	return (
		<nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1">
			{segments.map((segment, index) => (
				<div key={`${segment.href}:${segment.label}:${index}`} className="flex min-w-0 items-center gap-1">
					{index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "var(--text-tertiary)" }} /> : null}
					{segment.isCurrent ? (
						<span className="truncate" style={{ color: "var(--text-secondary)" }}>
							{segment.label}
						</span>
					) : (
						<Link
							href={segment.href}
							prefetch
							className="truncate transition-colors hover:underline"
							style={{ color: "var(--text-primary)" }}>
							{segment.label}
						</Link>
					)}
				</div>
			))}
		</nav>
	);
}
