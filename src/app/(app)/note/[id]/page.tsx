import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
	const session = await auth();
	if (!session?.user?.id) {
		notFound();
	}

	const { id } = await params;

	const note = await prisma.note.findFirst({
		where: {
			id,
			deletedAt: null,
			workspace: {
				userId: session.user.id,
			},
		},
		select: {
			id: true,
		},
	});

	if (!note) {
		notFound();
	}

	return null;
}
