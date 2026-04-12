import { Trash2 } from "lucide-react";

export function TrashEmptyState() {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
			<Trash2 className="h-12 w-12" style={{ color: "#3a3a3a" }} />
			<div className="space-y-1">
				<h3 className="text-base font-semibold text-[var(--text-primary)]">Trash is empty</h3>
				<p className="text-sm text-[var(--text-secondary)]">Deleted notes and folders will appear here for 30 days</p>
			</div>
		</div>
	);
}
