import { createHash } from "node:crypto";
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "@auth/core/adapters";
import { prisma } from "@/lib/prisma";
import { buildMagicLinkEmail } from "@/lib/email/magic-link";
import { GUEST_INACTIVITY_MS } from "@/lib/guest-session";
import { invalidateSessionCache, invalidateUserProfileCache, getAuthSession } from "@/lib/server-auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie";

function readEnvValue(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseUrl(value: string | undefined, base?: string): URL | null {
	if (!value) {
		return null;
	}

	try {
		return base ? new URL(value, base) : new URL(value);
	} catch {
		if (!base && !value.startsWith("http://") && !value.startsWith("https://")) {
			try {
				return new URL(`https://${value}`);
			} catch {
				return null;
			}
		}

		return null;
	}
}

function resolveAuthBaseUrl(): string {
	const configuredUrl =
		readEnvValue(process.env.AUTH_URL) ??
		readEnvValue(process.env.NEXTAUTH_URL) ??
		readEnvValue(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
		readEnvValue(process.env.VERCEL_URL);

	const parsedConfiguredUrl = parseUrl(configuredUrl);
	if (parsedConfiguredUrl) {
		return parsedConfiguredUrl.origin;
	}

	return "http://localhost:3000";
}

function resolveAuthSecret(): string {
	const configuredSecret = readEnvValue(process.env.AUTH_SECRET) ?? readEnvValue(process.env.NEXTAUTH_SECRET);
	if (configuredSecret) {
		return configuredSecret;
	}

	const fallbackSeed =
		readEnvValue(process.env.DATABASE_URL) ??
		readEnvValue(process.env.DIRECT_URL) ??
		readEnvValue(process.env.POSTGRES_URL) ??
		readEnvValue(process.env.VERCEL_URL) ??
		"stacknote-auth-fallback";

	console.warn("[auth] AUTH_SECRET/NEXTAUTH_SECRET is not set. Using a derived fallback secret; configure a dedicated secret in production.");
	return createHash("sha256").update(fallbackSeed).digest("hex");
}

const authBaseUrl = resolveAuthBaseUrl();
const authSecret = resolveAuthSecret();
const resendApiKey = process.env.RESEND_API_KEY?.trim();
const resendFrom = readEnvValue(process.env.RESEND_FROM) ?? "StackNote <noreply@stacknote.fvitu.qzz.io>";
const googleClientId = readEnvValue(process.env.GOOGLE_CLIENT_ID);
const googleClientSecret = readEnvValue(process.env.GOOGLE_CLIENT_SECRET);

if (!resendApiKey) {
	console.warn("[auth] RESEND_API_KEY is not set. Email magic-link sign-in is disabled.");
}

if (!googleClientId || !googleClientSecret) {
	console.warn("[auth] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set. Google sign-in is disabled.");
}

function createCachedAdapter(): Adapter {
	const baseAdapter = PrismaAdapter(prisma);

	return {
		...baseAdapter,
		async updateSession(data) {
			const session = await baseAdapter.updateSession?.(data);
			if (data.sessionToken) {
				await invalidateSessionCache(data.sessionToken, data.userId ?? session?.userId);
			}
			return session;
		},
	};
}


async function buildProviders() {
	const providers = [];

	if (resendApiKey) {
		const { default: Resend } = await import("next-auth/providers/resend");
		const { Resend: ResendClient } = await import("resend");
		const resendClient = new ResendClient(resendApiKey);

		providers.push(
			Resend({
				apiKey: resendApiKey,
				from: resendFrom,
				async sendVerificationRequest({ identifier: email, url, provider }) {
					const resolvedUrl = parseUrl(url, authBaseUrl) ?? new URL(authBaseUrl);
					const host = resolvedUrl.host;
					const { html, text } = buildMagicLinkEmail({ url: resolvedUrl.toString(), host, email });

					const { error } = await resendClient.emails.send({
						from: provider.from as string,
						to: [email],
						subject: "Sign in to StackNote",
						html,
						text,
					});

					if (error) {
						throw new Error(`Failed to send verification email: ${error.message}`);
					}
				},
			}),
		);
	}

	if (googleClientId && googleClientSecret) {
		const { default: Google } = await import("next-auth/providers/google");
		providers.push(
			Google({
				clientId: googleClientId,
				clientSecret: googleClientSecret,
			}),
		);
	}

	return providers;
}

const providers = await buildProviders();

const _nextAuth = NextAuth({
	trustHost: true,
	secret: authSecret,
	adapter: createCachedAdapter(),
	providers,
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
			const safeBaseUrl = parseUrl(baseUrl)?.origin ?? authBaseUrl;
			const safeBase = new URL(safeBaseUrl);

			if (url.startsWith("/")) {
				return new URL(url, safeBase).toString();
			}

			const destination = parseUrl(url, safeBase.toString());
			if (destination && destination.origin === safeBase.origin) {
				return destination.toString();
			}

			return safeBase.toString();
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
		async signOut(message) {
			if ("session" in message && message.session?.sessionToken) {
				await invalidateSessionCache(message.session.sessionToken, message.session.userId);
			}
		},
		async updateUser({ user }) {
			await invalidateUserProfileCache(user.id!);
		},
	},
});

export const handlers = _nextAuth.handlers;
export const signIn = _nextAuth.signIn;
export const signOut = _nextAuth.signOut;

export const auth = getAuthSession;
