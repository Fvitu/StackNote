import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit"
import { createAdminClient } from "@/lib/supabase/server"

const STORAGE_BUCKET = "stacknote-files"

export const GUEST_INACTIVITY_MS = 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
const GUEST_TOUCH_INTERVAL_MS = 5 * 60 * 1000

let cleanupPromise: Promise<void> | null = null
let lastCleanupAt = 0

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = []
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size))
	}
	return chunks
}

export function createGuestIdentity() {
	const nonce = crypto.randomUUID().replace(/-/g, "")
	return {
		email: `guest-${nonce}@guest.stacknote.local`,
		name: "Guest",
	}
}

export async function createGuestUserWithWorkspace() {
	await ensureDbReady(prisma)

	const now = new Date()
	const identity = createGuestIdentity()

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
	})

	await prisma.workspace.create({
		data: {
			name: "Guest Workspace",
			userId: user.id,
		},
	})

	return user
}

async function removeStoredFiles(paths: string[]) {
	if (!paths.length) {
		return
	}

	const supabase = createAdminClient()

	for (const batch of chunk(paths, 100)) {
		const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(batch)
		if (error) {
			console.error("Failed removing guest files from storage:", error)
		}
	}
}

export async function purgeGuestUser(userId: string) {
	await ensureDbReady(prisma)

	const files = await prisma.file.findMany({
		where: { userId },
		select: { path: true },
	})

	const uniquePaths = Array.from(new Set(files.map((file) => file.path).filter(Boolean)))
	await removeStoredFiles(uniquePaths)

	await prisma.user.deleteMany({
		where: {
			id: userId,
			isGuest: true,
		},
	})
}

export function isGuestExpired(lastActiveAt: Date | null | undefined, now = Date.now()) {
	if (!lastActiveAt) {
		return true
	}

	return now - lastActiveAt.getTime() >= GUEST_INACTIVITY_MS
}

export async function touchGuestActivity(userId: string, lastActiveAt: Date | null | undefined) {
	const now = Date.now()
	const lastActiveMs = lastActiveAt?.getTime() ?? 0

	if (now - lastActiveMs < GUEST_TOUCH_INTERVAL_MS) {
		return
	}

	await prisma.user.updateMany({
		where: {
			id: userId,
			isGuest: true,
		},
		data: {
			guestLastActiveAt: new Date(now),
		},
	})
}

export async function cleanupExpiredGuestUsers() {
	const now = Date.now()
	const expiryDate = new Date(now - GUEST_INACTIVITY_MS)

	await ensureDbReady(prisma)

	const expiredGuests = await prisma.user.findMany({
		where: {
			isGuest: true,
			OR: [
				{ guestLastActiveAt: null },
				{ guestLastActiveAt: { lt: expiryDate } },
			],
		},
		select: { id: true },
		take: 200,
	})

	for (const guest of expiredGuests) {
		try {
			await purgeGuestUser(guest.id)
		} catch (error) {
			console.error("Failed to purge expired guest user:", guest.id, error)
		}
	}
}

export function scheduleGuestCleanup() {
	const now = Date.now()

	if (cleanupPromise) {
		return cleanupPromise
	}

	if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
		return null
	}

	cleanupPromise = cleanupExpiredGuestUsers()
		.catch((error) => {
			console.error("Guest cleanup failed:", error)
		})
		.finally(() => {
			lastCleanupAt = Date.now()
			cleanupPromise = null
		})

	return cleanupPromise
}
