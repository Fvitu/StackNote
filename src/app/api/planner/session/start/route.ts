import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getPlannerStudyErrorResponse, startPlannerStudySession, type PlannerStudyItemInput } from "@/lib/planner-study-server";

export const maxDuration = 60;

interface StartPlannerSessionRequest {
	items?: PlannerStudyItemInput[];
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: StartPlannerSessionRequest;
	try {
		body = (await request.json()) as StartPlannerSessionRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	try {
		const payload = await startPlannerStudySession(session.user.id, Array.isArray(body.items) ? body.items : []);
		return NextResponse.json(payload);
	} catch (error) {
		return getPlannerStudyErrorResponse(error);
	}
}
