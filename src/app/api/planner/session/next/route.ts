import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { advancePlannerStudySession, getPlannerStudyErrorResponse } from "@/lib/planner-study-server";
import { isPlannerStudyQueueExam, type PlannerStudyQueueExam } from "@/lib/planner-study-session";

export const maxDuration = 60;

interface PlannerSessionNextRequest {
	queue?: PlannerStudyQueueExam[];
}

export async function POST(request: NextRequest) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let body: PlannerSessionNextRequest;
	try {
		body = (await request.json()) as PlannerSessionNextRequest;
	} catch {
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
	}

	if (!Array.isArray(body.queue) || !body.queue.every(isPlannerStudyQueueExam)) {
		return NextResponse.json({ error: "A valid planner queue is required" }, { status: 400 });
	}

	try {
		const payload = await advancePlannerStudySession(session.user.id, body.queue);
		return NextResponse.json(payload);
	} catch (error) {
		return getPlannerStudyErrorResponse(error);
	}
}
