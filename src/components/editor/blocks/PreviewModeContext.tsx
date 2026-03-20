"use client";

import { createContext, useContext, type ReactNode } from "react";

const PreviewModeContext = createContext(false);

export function PreviewModeProvider({ value, children }: { value: boolean; children: ReactNode }) {
	return <PreviewModeContext.Provider value={value}>{children}</PreviewModeContext.Provider>;
}

export function usePreviewMode() {
	return useContext(PreviewModeContext);
}
