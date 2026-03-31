import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie";
import { buildCacheKey, cacheDelete, cacheGet, cacheGetJson, cacheSet, cacheSetJson, secondsUntil } from "@/lib/cache";
import {
	GUEST_INACTIVITY_MS,
	GUEST_TOUCH_INTERVAL_MS,
	isGuestExpired,
	purgeGuestUser,
	scheduleGuestCleanup,
	touchGuestActivity,
} from "@/lib/guest-session";

const USER_CACHE_TTL_SECONDS = 60 * 5;

export const userProfileSelect = {
	id: true,
	email: true,
	name: true,
	image: true,
	isGuest: true,
	guestLastActiveAt: true,
} as const;

type SessionCookieReader =
	| NextRequest
	| Request
	| {
			cookies?: {
				get: (name: string) => { value: string } | undefined;
			};
	  };

export type UserProfile = {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
	isGuest: boolean;
	guestLastActiveAt: Date | null;
};

type SerializedUserProfile = Omit<UserProfile, "guestLastActiveAt"> & {
	guestLastActiveAt: string | null;
};

type SerializedSessionUser = {
	id: string;
	email: string | null;
	name: string | null;
	image: string | null;
	isGuest: boolean;
	isGoogleUser: boolean;
	guestExpiresAt?: string;
};

type SerializedSessionPayload = {
	userId: string;
	expires: string;
	user: SerializedSessionUser;
};

export type AppAuthSession = {
	user: SerializedSessionUser;
	expires: string;
};

function hashSessionToken(sessionToken: string) {
	return createHash("sha256").update(sessionToken).digest("hex");
}

function buildSessionIndexKey(tokenHash: string) {
	return buildCacheKey("stacknote", "auth", "session-index", tokenHash);
}

function buildSessionPayloadKey(userId: string, tokenHash: string) {
	return buildCacheKey("stacknote", "auth", "user", userId, "session", tokenHash);
}

function buildUserCacheKey(userId: string) {
	return buildCacheKey("stacknote", "auth", "user", userId, "profile");
}

function serializeUserProfile(user: UserProfile): SerializedUserProfile {
	return {
		...user,
		guestLastActiveAt: user.guestLastActiveAt?.toISOString() ?? null,
	};
}

function deserializeUserProfile(user: SerializedUserProfile): UserProfile {
	return {
		...user,
		guestLastActiveAt: user.guestLastActiveAt ? new Date(user.guestLastActiveAt) : null,
	};
}

function buildSessionUser(user: UserProfile, isGoogleUser: boolean) {
	const guestLastActiveAt = user.guestLastActiveAt ?? new Date();
	const guestExpiresAt = user.isGuest ? new Date(guestLastActiveAt.getTime() + GUEST_INACTIVITY_MS).toISOString() : undefined;

	return {
		id: user.id,
		email: user.email ?? null,
		name: user.name ?? null,
		image: user.image ?? null,
		isGuest: user.isGuest,
		isGoogleUser,
		...(guestExpiresAt ? { guestExpiresAt } : {}),
	} satisfies SerializedSessionUser;
}

function buildSessionPayload(user: UserProfile, expires: Date, isGoogleUser: boolean): SerializedSessionPayload {
	return {
		userId: user.id,
		expires: expires.toISOString(),
		user: buildSessionUser(user, isGoogleUser),
	};
}

async function readSessionToken(input?: SessionCookieReader) {
	if (input && typeof input === "object" && "cookies" in input && input.cookies?.get) {
		return input.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
	}

	const cookieStore = await cookies();
	return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
}

async function cacheUserProfile(user: UserProfile) {
	await cacheSetJson(buildUserCacheKey(user.id), serializeUserProfile(user), USER_CACHE_TTL_SECONDS);
}

async function writeSessionCache(sessionToken: string, payload: SerializedSessionPayload) {
	const tokenHash = hashSessionToken(sessionToken);
	const ttlSeconds = Math.min(
		secondsUntil(payload.expires),
		payload.user.isGuest && payload.user.guestExpiresAt ? secondsUntil(payload.user.guestExpiresAt) : Number.MAX_SAFE_INTEGER,
		payload.user.isGuest ? Math.max(1, Math.floor(GUEST_TOUCH_INTERVAL_MS / 1000)) : Number.MAX_SAFE_INTEGER,
	);

	await Promise.all([
		cacheSet(buildSessionIndexKey(tokenHash), payload.userId, ttlSeconds),
		cacheSetJson(buildSessionPayloadKey(payload.userId, tokenHash), payload, ttlSeconds),
	]);
}

async function readSessionCache(sessionToken: string): Promise<AppAuthSession | null> {
	const tokenHash = hashSessionToken(sessionToken);
	const cachedUserId = await cacheGet(buildSessionIndexKey(tokenHash));
	if (!cachedUserId) {
		return null;
	}

	const payload = await cacheGetJson<SerializedSessionPayload>(buildSessionPayloadKey(cachedUserId, tokenHash));
	if (!payload) {
		return null;
	}

	if (new Date(payload.expires).getTime() <= Date.now()) {
		await cacheDelete(buildSessionIndexKey(tokenHash), buildSessionPayloadKey(cachedUserId, tokenHash));
		return null;
	}

	if (payload.user.isGuest && payload.user.guestExpiresAt && new Date(payload.user.guestExpiresAt).getTime() <= Date.now()) {
		await cacheDelete(buildSessionIndexKey(tokenHash), buildSessionPayloadKey(cachedUserId, tokenHash));
		return null;
	}

	return {
		user: payload.user,
		expires: payload.expires,
	};
}

export async function invalidateSessionCache(sessionToken: string, userId?: string | null) {
	const tokenHash = hashSessionToken(sessionToken);
	const cachedUserId = userId ?? (await cacheGet(buildSessionIndexKey(tokenHash)));
	const keys = [buildSessionIndexKey(tokenHash)];

	if (cachedUserId) {
		keys.push(buildSessionPayloadKey(cachedUserId, tokenHash));
	}

	await cacheDelete(...keys);
}

export async function invalidateUserProfileCache(userId: string) {
	await cacheDelete(buildUserCacheKey(userId));
}

export async function getCachedUser(userId: string): Promise<UserProfile | null> {
	const cachedUser = await cacheGetJson<SerializedUserProfile>(buildUserCacheKey(userId));
	if (cachedUser) {
		return deserializeUserProfile(cachedUser);
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: userProfileSelect,
	});

	if (!user) {
		return null;
	}

	await cacheUserProfile(user);
	return user;
}

export async function getAuthSession(input?: SessionCookieReader): Promise<AppAuthSession | null> {
	void scheduleGuestCleanup();

	const sessionToken = await readSessionToken(input);
	if (!sessionToken) {
		return null;
	}

	const cachedSession = await readSessionCache(sessionToken);
	if (cachedSession) {
		return cachedSession;
	}

	const session = await prisma.session.findUnique({
		where: { sessionToken },
		select: {
			sessionToken: true,
			expires: true,
			userId: true,
			user: {
				select: {
					...userProfileSelect,
					accounts: {
						where: {
							provider: "google",
						},
						select: {
							id: true,
						},
						take: 1,
					},
				},
			},
		},
	});

	if (!session || session.expires.getTime() <= Date.now()) {
		if (session) {
			await invalidateSessionCache(sessionToken, session.userId);
		}
		return null;
	}

	let user: UserProfile = {
		id: session.user.id,
		email: session.user.email,
		name: session.user.name,
		image: session.user.image,
		isGuest: session.user.isGuest,
		guestLastActiveAt: session.user.guestLastActiveAt,
	};
	const isGoogleUser = session.user.accounts.length > 0;
	if (user.isGuest) {
		if (isGuestExpired(user.guestLastActiveAt)) {
			await purgeGuestUser(user.id);
			await invalidateSessionCache(sessionToken, user.id);
			await invalidateUserProfileCache(user.id);
			return null;
		}

		const shouldTouchGuest = !user.guestLastActiveAt || Date.now() - user.guestLastActiveAt.getTime() >= GUEST_TOUCH_INTERVAL_MS;
		if (shouldTouchGuest) {
			const touchedAt = new Date();
			void touchGuestActivity(user.id, user.guestLastActiveAt).catch((error) => {
				console.error("Failed to update guest activity:", error);
			});
			user = {
				...user,
				guestLastActiveAt: touchedAt,
			};
		}
	}

	await cacheUserProfile(user);
	const payload = buildSessionPayload(user, session.expires, isGoogleUser);
	await writeSessionCache(session.sessionToken, payload);

	return {
		user: payload.user,
		expires: payload.expires,
	};
}
