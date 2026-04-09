import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCurrentWorkspace } from "@/lib/server-data";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { id } = await params;
		const { name } = await request.json();
		const trimmedName = typeof name === "string" ? name.trim() : "";

		if (!trimmedName) {
			return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });
		}

		const workspace = await prisma.workspace.findFirst({
			where: {
				id,
				userId: session.user.id,
			},
			select: { id: true },
		});

		if (!workspace) {
			return NextResponse.json({ error: "Forbidden" }, { status: 403 });
		}

		const updatedWorkspace = await prisma.workspace.update({
			where: { id },
			data: { name: trimmedName },
			select: {
				id: true,
				name: true,
			},
		});

		await invalidateCurrentWorkspace(session.user.id);

		return NextResponse.json(updatedWorkspace);
	} catch (error) {
		console.error("Failed to update workspace:", error);
		return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
	}
}
