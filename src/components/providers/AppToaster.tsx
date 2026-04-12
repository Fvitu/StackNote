"use client";

import { Toaster } from "sonner";

export function AppToaster() {
	return (
		<Toaster
			theme="dark"
			closeButton
			position="bottom-right"
			toastOptions={{
				className: "border border-white/10 bg-[#0f0f0f] text-[#e8e8e8]",
				descriptionClassName: "text-[#9a9a9a]",
				actionButtonStyle: {
					background: "#7c6aff",
					color: "#ffffff",
				},
				cancelButtonStyle: {
					background: "#1a1a1a",
					color: "#e8e8e8",
				},
				style: {
					background: "#0f0f0f",
					border: "1px solid rgba(255,255,255,0.08)",
					color: "#e8e8e8",
				},
			}}
		/>
	);
}
