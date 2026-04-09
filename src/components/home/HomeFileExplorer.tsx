"use client";

import dynamic from "next/dynamic";
import type { HomeFileTree } from "@/components/home/file-manager-types";

const FileExplorer = dynamic(() => import("@/components/home/FileExplorer").then((module) => module.FileExplorer), {
	ssr: false,
	loading: () => <div className="h-[520px] rounded-2xl border border-white/10 bg-white/[0.03]" />,
});

export function HomeFileExplorer({
	workspaceId,
	initialTree,
	folderId,
}: {
	workspaceId: string;
	initialTree: HomeFileTree;
	folderId?: string | null;
}) {
	return <FileExplorer workspaceId={workspaceId} initialTree={initialTree} folderId={folderId} />;
}