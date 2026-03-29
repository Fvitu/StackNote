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
