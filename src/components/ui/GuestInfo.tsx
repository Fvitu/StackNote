"use client"

import React from "react"

export function GuestInfo({ children, className }: { children?: React.ReactNode; className?: string }) {
    return (
        <div
            className={"p-1 text-xs " + (className ?? "")}>
            <p style={{ color: "var(--text-tertiary)", margin: 0, textAlign: "center", lineHeight: "1.4" }}>{children}</p>
        </div>
    )
}
