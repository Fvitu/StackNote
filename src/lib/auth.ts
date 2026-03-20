import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Resend from "next-auth/providers/resend"
import Google from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"

const _nextAuth = NextAuth({
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
	callbacks: {
		session({ session, user }) {
			session.user.id = user.id;
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
export const auth = _nextAuth.auth;
