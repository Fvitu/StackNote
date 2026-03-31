import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAiUsage, getCurrentWorkspace, getUserSettings, getWorkspaceTree } from "@/lib/server-data";

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const userId = session.user.id;

	try {
		const [workspace, settings, aiUsage] = await Promise.all([
			getCurrentWorkspace(userId),
			getUserSettings(userId),
			getAiUsage(userId),
		]);

		if (!workspace) {
			return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
		}

		const tree = await getWorkspaceTree(userId, workspace.id, { skipOwnershipCheck: true });

		if (!tree) {
			return NextResponse.json({ error: "Workspace tree not found" }, { status: 404 });
		}

		return NextResponse.json(
			{
				user: {
					id: session.user.id,
					name: session.user.name,
					email: session.user.email ?? "",
					image: session.user.image,
				},
				workspace,
				tree,
				settings,
				aiUsage,
				auth: {
					isGuestUser: session.user.isGuest,
					isGoogleUser: session.user.isGoogleUser,
					needsName: !session.user.isGuest && !session.user.name && !session.user.isGoogleUser,
				},
			},
			{
				headers: {
					"Cache-Control": "private, max-age=15, stale-while-revalidate=60",
				},
			},
		);
	} catch (error) {
		console.error("Failed to load bootstrap data:", error);
		return NextResponse.json({ error: "Failed to load bootstrap data" }, { status: 500 });
	}
}
