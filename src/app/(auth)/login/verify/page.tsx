export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "var(--bg-app)" }}>
      <div
        className="w-full max-w-[400px] rounded-[var(--sn-radius-lg)] p-10 text-center"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: "var(--accent-muted)" }}>
          <svg
            className="h-6 w-6"
            style={{ color: "var(--sn-accent)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
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
          We sent a magic link to your email address. Click the link to sign in.
        </p>
      </div>
    </div>
  )
}
