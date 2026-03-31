import type { UsageStats } from "@/lib/rate-limit";
import type { WorkspaceTree } from "@/types";

export interface BootstrapResponse {
	user: {
		id: string;
		name: string | null;
		email: string;
		image: string | null;
	};
	workspace: {
		id: string;
		name: string;
	};
	tree: WorkspaceTree;
	settings: {
		preferredTextModel: string;
		preferredSttModel: string;
	};
	aiUsage: UsageStats;
	auth: {
		isGuestUser: boolean;
		isGoogleUser: boolean;
		needsName: boolean;
	};
}
