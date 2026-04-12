"use client";

import { PanelLeftOpen } from "lucide-react";
import { ScrollRevealBar } from "@/components/layout/ScrollRevealBar";
import { useWorkspace } from "@/contexts/WorkspaceContext";

export function HomeTopBar({ title = "Home" }: { title?: string } = {}) {
	const { state, toggleSidebar } = useWorkspace();

	return (
		<ScrollRevealBar
			revealOnScroll={false}
			className="-mx-4 mb-4 flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-default)] bg-[#0a0a0a] px-4 sm:-mx-6 sm:px-6">
			<div className="flex items-center gap-2">
				{!state.isSidebarOpen && (
					<button
						type="button"
						onClick={toggleSidebar}
						className="flex h-6 w-6 items-center justify-center rounded-[var(--sn-radius-sm)] transition-colors duration-150 hover:bg-[#1a1a1a]"
						title="Open sidebar (Ctrl+\\)"
						aria-label="Open sidebar">
						<PanelLeftOpen className="h-4 w-4" style={{ color: "var(--text-tertiary)" }} />
					</button>
				)}
				<span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: "var(--text-tertiary)" }}>
					{title}
				</span>
			</div>
		</ScrollRevealBar>
	);
}