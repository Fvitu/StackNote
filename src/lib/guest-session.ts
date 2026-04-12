import { prisma } from "@/lib/prisma";
import { collectStoredFilePathsForNotes, deleteStoredObjects } from "@/lib/trash";

export const GUEST_INACTIVITY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
export const GUEST_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

let cleanupPromise: Promise<void> | null = null;
let lastCleanupAt = 0;

export function createGuestIdentity() {
	const nonce = crypto.randomUUID().replace(/-/g, "");
	return {
		email: `guest-${nonce}@guest.stacknote.local`,
		name: "Guest",
	};
}

export async function createGuestUserWithWorkspace() {
	const now = new Date();
	const identity = createGuestIdentity();

	const user = await prisma.user.create({
		data: {
			email: identity.email,
			name: identity.name,
			isGuest: true,
			guestLastActiveAt: now,
		},
		select: {
			id: true,
			isGuest: true,
			guestLastActiveAt: true,
		},
	});

	await prisma.workspace.create({
		data: {
			name: "Guest Workspace",
			userId: user.id,
		},
	});

	return user;
}

export async function purgeGuestUser(userId: string) {
	const notes = await prisma.note.findMany({
		where: {
			workspace: {
				userId,
			},
		},
		select: {
			id: true,
		},
	});

	const noteIds = notes.map((note) => note.id);
	const paths = await collectStoredFilePathsForNotes(prisma, noteIds);
	if (paths.length > 0) {
		await deleteStoredObjects(paths);
	}

	await prisma.user.deleteMany({
		where: {
			id: userId,
			isGuest: true,
		},
	});
}

export function isGuestExpired(lastActiveAt: Date | null | undefined, now = Date.now()) {
	if (!lastActiveAt) {
		return true;
	}

	return now - lastActiveAt.getTime() >= GUEST_INACTIVITY_MS;
}

export async function touchGuestActivity(userId: string, lastActiveAt: Date | null | undefined) {
	const now = Date.now();
	const lastActiveMs = lastActiveAt?.getTime() ?? 0;

	if (now - lastActiveMs < GUEST_TOUCH_INTERVAL_MS) {
		return;
	}

	await prisma.user.updateMany({
		where: {
			id: userId,
			isGuest: true,
		},
		data: {
			guestLastActiveAt: new Date(now),
		},
	});
}

export async function cleanupExpiredGuestUsers() {
	const now = Date.now();
	const expiryDate = new Date(now - GUEST_INACTIVITY_MS);

	const expiredGuests = await prisma.user.findMany({
		where: {
			isGuest: true,
			OR: [{ guestLastActiveAt: null }, { guestLastActiveAt: { lt: expiryDate } }],
		},
		select: { id: true },
		take: 200,
	});

	for (const guest of expiredGuests) {
		try {
			await purgeGuestUser(guest.id);
		} catch (error) {
			console.error("Failed to purge expired guest user:", guest.id, error);
		}
	}
}

export function scheduleGuestCleanup() {
	const now = Date.now();

	if (cleanupPromise) {
		return cleanupPromise;
	}

	if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
		return null;
	}

	cleanupPromise = cleanupExpiredGuestUsers()
		.catch((error) => {
			console.error("Guest cleanup failed:", error);
		})
		.finally(() => {
			lastCleanupAt = Date.now();
			cleanupPromise = null;
		});

	return cleanupPromise;
}
