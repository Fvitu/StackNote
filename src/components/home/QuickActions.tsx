"use client";

import { useRouter } from "next/navigation";
import { FolderPlus, Plus, Target, Upload } from "lucide-react";
import { dispatchHomeQuickAction } from "@/components/home/home-quick-action-events";

const baseActionClassName =
	"group inline-flex items-center gap-2 rounded-full border border-l-2 px-4 py-2.5 text-sm transition-all duration-200 hover:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#7c6aff]/30";

export function QuickActions() {
	const router = useRouter();

	return (
		<div className="flex flex-wrap gap-3">
			<button
				type="button"
				onClick={() => dispatchHomeQuickAction("new-note")}
				className={`${baseActionClassName} border-[#7c6aff] bg-[#7c6aff] text-white hover:border-[#7c6aff] hover:bg-[#7c6aff]/90`}>
				<Plus className="h-4 w-4" />
				<span>New note</span>
			</button>

			<button
				type="button"
				onClick={() => dispatchHomeQuickAction("new-folder")}
				className={`${baseActionClassName} border-[#222222] bg-transparent text-[#f0f0f0] hover:border-l-[#7c6aff]`}>
				<FolderPlus className="h-4 w-4 text-[#888888] transition-colors duration-200 group-hover:text-[#c4bbff]" />
				<span>New folder</span>
			</button>

			<button
				type="button"
				onClick={() => dispatchHomeQuickAction("upload-file")}
				className={`${baseActionClassName} border-[#222222] bg-transparent text-[#f0f0f0] hover:border-l-[#7c6aff]`}>
				<Upload className="h-4 w-4 text-[#888888] transition-colors duration-200 group-hover:text-[#c4bbff]" />
				<span>Upload file</span>
			</button>

			<button
				type="button"
				onClick={() => router.push("/planner")}
				className={`${baseActionClassName} border-[#222222] bg-transparent text-[#f0f0f0] hover:border-l-[#7c6aff]`}>
				<Target className="h-4 w-4 text-[#888888] transition-colors duration-200 group-hover:text-[#c4bbff]" />
				<span>Start focus session</span>
			</button>
		</div>
	);
}
