"use client"

import Image from "next/image";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react"
import { AlertCircle, MailWarning, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type LoginNotice = {
	title: string;
	description: string;
	tone: "warning" | "error";
};

function getLoginNotice(errorCode: string | null, reason: string | null): LoginNotice | null {
	if (reason === "session-expired" || errorCode === "SessionRequired") {
		return {
			title: "Session expired",
			description: "Your session ended for security reasons. Sign in again to continue.",
			tone: "warning",
		};
	}

	if (!errorCode) {
		return null;
	}

	const notices: Record<string, LoginNotice> = {
		OAuthSignin: {
			title: "Google sign-in unavailable",
			description: "We could not start Google authentication. Please try again.",
			tone: "error",
		},
		OAuthCallback: {
			title: "Google sign-in failed",
			description: "The authentication callback did not complete. Please retry.",
			tone: "error",
		},
		OAuthCreateAccount: {
			title: "Unable to create account",
			description: "We could not create your account with Google. Please try again.",
			tone: "error",
		},
		EmailCreateAccount: {
			title: "Unable to create account",
			description: "We could not create your account from this email link.",
			tone: "error",
		},
		AccessDenied: {
			title: "Access denied",
			description: "Your sign-in attempt was denied. Contact support if this persists.",
			tone: "error",
		},
		Verification: {
			title: "Invalid or expired link",
			description: "This magic link is no longer valid. Request a new one.",
			tone: "warning",
		},
		OAuthAccountNotLinked: {
			title: "Account provider mismatch",
			description: "This email is linked to another sign-in method. Use the original provider.",
			tone: "warning",
		},
		Configuration: {
			title: "Authentication unavailable",
			description: "Login is temporarily unavailable due to a server configuration issue.",
			tone: "error",
		},
		Default: {
			title: "Sign-in error",
			description: "An unexpected authentication error occurred. Please try again.",
			tone: "error",
		},
	};

	return notices[errorCode] ?? notices.Default;
}

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [dismissedNoticeKey, setDismissedNoticeKey] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const authNotice = useMemo(() => getLoginNotice(searchParams.get("error"), searchParams.get("reason")), [searchParams]);
  const noticeKey = authNotice ? `${authNotice.title}:${authNotice.description}` : null;
  const showAuthNotice = Boolean(authNotice && noticeKey !== dismissedNoticeKey);

  async function handleMagicLink(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;
		setLoading(true);
		setInlineError(null);

		try {
			await signIn("resend", { email, callbackUrl: "/" });
		} catch {
			setInlineError("We could not send your login link. Please try again.");
			setLoading(false);
		}
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    setInlineError(null);
	try {
		await signIn("google", { callbackUrl: "/" });
	} catch {
		setInlineError("Google sign-in failed to start. Please try again.");
		setGoogleLoading(false);
	}
  }

  return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8" style={{ backgroundColor: "var(--bg-app)" }}>
			<div className="pointer-events-none absolute inset-0 opacity-60">
				<div className="absolute -left-24 top-[-80px] h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: "var(--accent-muted)" }} />
				<div className="absolute -right-32 bottom-[-120px] h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: "rgba(143, 127, 255, 0.15)" }} />
			</div>

			<div
				className="relative z-10 w-full max-w-[460px] rounded-[var(--sn-radius-lg)] px-6 py-7 sm:px-10 sm:py-9"
				style={{
					backgroundColor: "rgba(17, 17, 17, 0.92)",
					border: "1px solid var(--border-default)",
					boxShadow: "0 20px 55px rgba(0, 0, 0, 0.35)",
				}}>
				<div className="mb-7 text-center">
					<div
						className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
						style={{ borderColor: "var(--border-strong)", backgroundColor: "#0b0b0b" }}>
						<Image src="/StackNote.png" alt="StackNote logo" width={38} height={38} priority className="h-9 w-9 rounded-md" />
					</div>
					<h1 className="mb-2 text-2xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
						Welcome to StackNote
					</h1>
					<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
						Sign in with your email or continue with Google.
					</p>
				</div>

				{showAuthNotice && authNotice && (
					<div
						role="alert"
						className="mb-4 rounded-lg border p-3 text-sm"
						style={{
							borderColor: authNotice.tone === "warning" ? "rgba(245, 158, 11, 0.45)" : "rgba(239, 68, 68, 0.45)",
							backgroundColor: authNotice.tone === "warning" ? "rgba(245, 158, 11, 0.10)" : "rgba(239, 68, 68, 0.10)",
						}}>
						<div className="flex items-start gap-2">
							{authNotice.tone === "warning" ? (
								<MailWarning className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#f59e0b" }} />
							) : (
								<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
							)}
							<div className="min-w-0 flex-1">
								<p className="font-medium" style={{ color: "var(--text-primary)" }}>
									{authNotice.title}
								</p>
								<p style={{ color: "var(--text-secondary)" }}>{authNotice.description}</p>
							</div>
							<button
								aria-label="Dismiss notification"
								onClick={() => setDismissedNoticeKey(noticeKey)}
								className="rounded p-1 transition-colors hover:bg-black/20"
								type="button">
								<X className="h-4 w-4" style={{ color: "var(--text-secondary)" }} />
							</button>
						</div>
					</div>
				)}

				{inlineError && (
					<div
						role="alert"
						className="mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm"
						style={{
							borderColor: "rgba(239, 68, 68, 0.45)",
							backgroundColor: "rgba(239, 68, 68, 0.10)",
						}}>
						<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#ef4444" }} />
						<p style={{ color: "var(--text-primary)" }}>{inlineError}</p>
					</div>
				)}

				<form onSubmit={handleMagicLink} className="space-y-3">
					<label htmlFor="email" className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
						Email
					</label>
					<Input
						id="email"
						type="email"
						placeholder="you@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="h-10 border-[rgba(255,255,255,0.08)] bg-[#0a0a0a] text-[#e8e8e8] placeholder:text-[#555555] focus-visible:ring-2 focus-visible:ring-[var(--sn-accent)]"
						autoComplete="email"
					/>
					<Button
						type="submit"
						disabled={loading || !email}
						className="h-10 w-full text-white disabled:opacity-50 transition-all duration-150"
						style={{ backgroundColor: "var(--sn-accent)" }}
						onMouseEnter={(e) => {
							if (!loading && email) {
								(e.currentTarget as HTMLElement).style.backgroundColor = "var(--accent-hover)";
							}
						}}
						onMouseLeave={(e) => {
							(e.currentTarget as HTMLElement).style.backgroundColor = "var(--sn-accent)";
						}}>
						{loading ? "Sending..." : "Send magic link"}
					</Button>
				</form>

				<div className="my-6 flex items-center gap-3">
					<Separator className="flex-1 bg-[rgba(255,255,255,0.06)]" />
					<span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
						or
					</span>
					<Separator className="flex-1 bg-[rgba(255,255,255,0.06)]" />
				</div>

				<Button
					variant="outline"
					onClick={handleGoogle}
					disabled={googleLoading}
					className="h-10 w-full border-[rgba(255,255,255,0.08)] bg-transparent text-[#e8e8e8] hover:bg-[#1a1a1a]">
					<svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
						<path
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
							fill="#4285F4"
						/>
						<path
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
							fill="#34A853"
						/>
						<path
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
							fill="#FBBC05"
						/>
						<path
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
							fill="#EA4335"
						/>
					</svg>
					{googleLoading ? "Redirecting..." : "Continue with Google"}
				</Button>

				<p className="mt-4 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
					By signing in, you agree to keep your notes secure on this device.
				</p>
			</div>
		</div>
  );
}
