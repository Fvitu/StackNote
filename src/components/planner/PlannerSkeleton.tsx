"use client"

export function PlannerSkeleton() {
  return (
    <div className="flex h-full min-w-0 w-full flex-col items-center overflow-y-auto px-4 py-8 sm:px-6" style={{ backgroundColor: "var(--bg-app)" }}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 animate-pulse">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-3">
            <div className="h-3 w-28 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
            <div className="h-9 w-56 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          </div>
          <div className="h-10 w-32 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[24px] border p-5"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-default)",
                }}>
                <div className="h-5 w-36 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
                <div className="mt-3 h-4 w-24 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                <div className="mt-5 h-3 w-32 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                <div className="mt-6 h-9 w-full rounded-xl" style={{ backgroundColor: "rgba(124,106,255,0.22)" }} />
              </div>
            ))}
          </div>

          <div
            className="rounded-[24px] border p-6"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-default)",
            }}>
            <div className="h-6 w-36 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.12)" }} />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-sidebar)" }}>
                  <div className="h-4 w-40 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
                  <div className="mt-2 h-3 w-28 rounded-md" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />
                </div>
              ))}
            </div>
            <div className="mt-5 h-9 w-full rounded-xl" style={{ backgroundColor: "rgba(124,106,255,0.22)" }} />
          </div>
        </div>
      </div>
    </div>
  )
}
