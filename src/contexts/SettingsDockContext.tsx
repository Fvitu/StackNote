"use client";

import { createContext, useContext, type ReactNode } from "react";

interface SettingsDockContextValue {
	openSettingsDock: () => void;
	isSettingsDockOpen: boolean;
}

const SettingsDockContext = createContext<SettingsDockContextValue | null>(null);

export function SettingsDockProvider({
	children,
	value,
}: {
	children: ReactNode;
	value: SettingsDockContextValue;
}) {
	return <SettingsDockContext.Provider value={value}>{children}</SettingsDockContext.Provider>;
}

export function useSettingsDock() {
	const context = useContext(SettingsDockContext);

	if (!context) {
		throw new Error("useSettingsDock must be used within SettingsDockProvider");
	}

	return context;
}