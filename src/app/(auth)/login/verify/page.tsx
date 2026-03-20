import Image from "next/image";

export default function VerifyPage() {
	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8" style={{ backgroundColor: "var(--bg-app)" }}>
			<div className="pointer-events-none absolute inset-0 opacity-60">
				<div className="absolute -left-24 top-[-80px] h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: "var(--accent-muted)" }} />
				<div className="absolute -right-32 bottom-[-120px] h-96 w-96 rounded-full blur-3xl" style={{ backgroundColor: "rgba(143, 127, 255, 0.15)" }} />
			</div>

			<div
				className="relative z-10 w-full max-w-[460px] rounded-[var(--sn-radius-lg)] px-6 py-8 text-center sm:px-10"
				style={{
					backgroundColor: "rgba(17, 17, 17, 0.92)",
					border: "1px solid var(--border-default)",
					boxShadow: "0 20px 55px rgba(0, 0, 0, 0.35)",
				}}>
				<div
					className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border"
					style={{ borderColor: "var(--border-strong)", backgroundColor: "#0b0b0b" }}>
					<Image src="/StackNote.png" alt="StackNote logo" width={38} height={38} priority className="h-9 w-9 rounded-md" />
				</div>
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--accent-muted)" }}>
					<svg className="h-6 w-6" style={{ color: "var(--sn-accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<h2 className="mb-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
					Check your email
				</h2>
				<p className="text-sm" style={{ color: "var(--text-secondary)" }}>
					We sent a magic link to your email address. Open it on this device to securely sign in.
				</p>
			</div>
		</div>
	);
}
