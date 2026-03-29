import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Resend from "next-auth/providers/resend"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import { GUEST_INACTIVITY_MS, isGuestExpired, purgeGuestUser, scheduleGuestCleanup, touchGuestActivity } from "@/lib/guest-session";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie";

const _nextAuth = NextAuth({
	trustHost: true,
	adapter: PrismaAdapter(prisma),
	providers: [
		Resend({
			apiKey: process.env.RESEND_API_KEY,
			from: "StackNote <support@stacknote.fvitu.qzz.io>",
		}),
		Google({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		}),
	],
	pages: {
		signIn: "/login",
		verifyRequest: "/login/verify",
		error: "/login",
	},
	cookies: {
		sessionToken: {
			name: SESSION_COOKIE_NAME,
			options: {
				httpOnly: true,
				sameSite: "lax",
				path: "/",
				secure: process.env.NODE_ENV === "production",
			},
		},
	},
	callbacks: {
		redirect({ url, baseUrl }) {
			if (url.startsWith("/")) {
				return `${baseUrl}${url}`;
			}

			try {
				const destination = new URL(url);
				if (destination.origin === baseUrl) {
					return url;
				}
			} catch {
				return baseUrl;
			}

			return baseUrl;
		},
		session({ session, user }) {
			session.user.id = user.id;
			session.user.isGuest = Boolean((user as { isGuest?: boolean | null }).isGuest);

			const guestLastActiveAt = (user as { guestLastActiveAt?: Date | null }).guestLastActiveAt;
			if (session.user.isGuest && guestLastActiveAt) {
				session.user.guestExpiresAt = new Date(guestLastActiveAt.getTime() + GUEST_INACTIVITY_MS).toISOString();
			}

			return session;
		},
	},
	events: {
		async createUser({ user }) {
			await prisma.workspace.create({
				data: {
					name: "My Workspace",
					userId: user.id!,
				},
			});
		},
	},
});

export const handlers = _nextAuth.handlers;
export const signIn = _nextAuth.signIn;
export const signOut = _nextAuth.signOut;

const baseAuth = _nextAuth.auth;

export const auth = (async (...args: unknown[]) => {
	const session = await (baseAuth as (...innerArgs: unknown[]) => Promise<unknown>)(...args);
	void scheduleGuestCleanup();

	if (!session || typeof session !== "object" || !("user" in session)) {
		return session;
	}

	const typedSession = session as {
		user?: {
			id?: string;
			isGuest?: boolean;
			guestExpiresAt?: string;
		};
	};

	if (!typedSession.user?.id || !typedSession.user.isGuest) {
		return session;
	}

	const guestUser = await prisma.user.findUnique({
		where: { id: typedSession.user.id },
		select: {
			isGuest: true,
			guestLastActiveAt: true,
		},
	});

	if (!guestUser?.isGuest) {
		return session;
	}

	if (isGuestExpired(guestUser.guestLastActiveAt)) {
		await purgeGuestUser(typedSession.user.id);
		return null;
	}

	void touchGuestActivity(typedSession.user.id, guestUser.guestLastActiveAt).catch((error) => {
		console.error("Failed to update guest activity:", error);
	});

	const activeAt = guestUser.guestLastActiveAt ?? new Date();
	typedSession.user.isGuest = true;
	typedSession.user.guestExpiresAt = new Date(activeAt.getTime() + GUEST_INACTIVITY_MS).toISOString();

	return session;
}) as typeof baseAuth;
