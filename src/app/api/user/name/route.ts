import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie";
import { invalidateSessionCache, invalidateUserProfileCache } from "@/lib/server-auth";

export async function PATCH(request: NextRequest) {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { name } = await request.json();

		if (!name || typeof name !== "string" || name.trim() === "") {
			return NextResponse.json({ error: "Name is required" }, { status: 400 });
		}

		await prisma.user.update({
			where: { id: session.user.id },
			data: { name: name.trim() },
		});

		await invalidateUserProfileCache(session.user.id);

		const cookieStore = await cookies();
		const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
		if (sessionToken) {
			await invalidateSessionCache(sessionToken, session.user.id);
		}

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error("Failed to update user name:", error);
		return NextResponse.json({ error: "Failed to update name" }, { status: 500 });
	}
}
