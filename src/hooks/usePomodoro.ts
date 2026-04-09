"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type PomodoroSessionType = "focus" | "shortBreak" | "longBreak";

export interface PomodoroSettings {
	focusDuration: number;
	shortBreak: number;
	longBreak: number;
	cycleLength: number;
	autoStartBreaks: boolean;
	autoStartPomodoros: boolean;
}

export interface PomodoroSessionState {
	type: PomodoroSessionType;
	remainingSeconds: number;
	totalSeconds: number;
	completedPomodoros: number;
	cycleLength: number;
	isRunning: boolean;
	isCollapsed: boolean;
	isSettingsOpen: boolean;
}

const STORAGE_KEY = "stacknote_pomodoro_settings";

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
	focusDuration: 25,
	shortBreak: 5,
	longBreak: 15,
	cycleLength: 4,
	autoStartBreaks: false,
	autoStartPomodoros: false,
};

function readStoredSettings() {
	if (typeof window === "undefined") {
		return DEFAULT_POMODORO_SETTINGS;
	}

	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return DEFAULT_POMODORO_SETTINGS;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<PomodoroSettings>;
		return {
			...DEFAULT_POMODORO_SETTINGS,
			...parsed,
		};
	} catch {
		return DEFAULT_POMODORO_SETTINGS;
	}
}

function getSessionSeconds(type: PomodoroSessionType, settings: PomodoroSettings) {
	switch (type) {
		case "focus":
			return settings.focusDuration * 60;
		case "shortBreak":
			return settings.shortBreak * 60;
		case "longBreak":
			return settings.longBreak * 60;
	}
}

export function usePomodoro(onSessionComplete?: (sessionType: PomodoroSessionType) => void) {
	const [settings, setSettings] = useState<PomodoroSettings>(() => readStoredSettings());
	const [sessionType, setSessionType] = useState<PomodoroSessionType>("focus");
	const [completedPomodoros, setCompletedPomodoros] = useState(0);
	const [remainingSeconds, setRemainingSeconds] = useState(() => getSessionSeconds("focus", readStoredSettings()));
	const [isRunning, setIsRunning] = useState(false);
	const [isCollapsed, setIsCollapsed] = useState(true);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const totalSeconds = useMemo(() => getSessionSeconds(sessionType, settings), [sessionType, settings]);

	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	}, [settings]);

	const moveToSession = useCallback(
		(nextSessionType: PomodoroSessionType, autoStart: boolean) => {
			setSessionType(nextSessionType);
			setRemainingSeconds(getSessionSeconds(nextSessionType, settings));
			setIsRunning(autoStart);
		},
		[settings],
	);

	const advanceSession = useCallback(() => {
		onSessionComplete?.(sessionType);

		if (sessionType === "focus") {
			const nextCompletedPomodoros = completedPomodoros + 1;
			const shouldStartLongBreak = nextCompletedPomodoros >= settings.cycleLength;
			if (shouldStartLongBreak) {
				setCompletedPomodoros(0);
				moveToSession("longBreak", settings.autoStartBreaks);
				return;
			}

			setCompletedPomodoros(nextCompletedPomodoros);
			moveToSession("shortBreak", settings.autoStartBreaks);
			return;
		}

		moveToSession("focus", settings.autoStartPomodoros);
	}, [completedPomodoros, moveToSession, onSessionComplete, sessionType, settings]);

	useEffect(() => {
		if (!isRunning) {
			return;
		}

		const interval = window.setInterval(() => {
			setRemainingSeconds((currentSeconds) => {
				if (currentSeconds <= 1) {
					window.clearInterval(interval);
					setIsRunning(false);
					window.setTimeout(() => advanceSession(), 0);
					return 0;
				}

				return currentSeconds - 1;
			});
		}, 1000);

		return () => window.clearInterval(interval);
	}, [advanceSession, isRunning]);

	const toggle = useCallback(() => {
		setIsRunning((running) => !running);
	}, []);

	const reset = useCallback(() => {
		setIsRunning(false);
		setRemainingSeconds(getSessionSeconds(sessionType, settings));
	}, [sessionType, settings]);

	const skip = useCallback(() => {
		setIsRunning(false);
		advanceSession();
	}, [advanceSession]);

	const saveSettings = useCallback(
		(nextSettings: PomodoroSettings) => {
			setSettings(nextSettings);
			setRemainingSeconds(getSessionSeconds(sessionType, nextSettings));
			setIsSettingsOpen(false);
		},
		[sessionType],
	);

	const sessionState: PomodoroSessionState = {
		type: sessionType,
		remainingSeconds,
		totalSeconds,
		completedPomodoros,
		cycleLength: settings.cycleLength,
		isRunning,
		isCollapsed,
		isSettingsOpen,
	};

	return {
		settings,
		sessionState,
		setCollapsed: setIsCollapsed,
		setSettingsOpen: setIsSettingsOpen,
		saveSettings,
		setSessionType: moveToSession,
		toggle,
		reset,
		skip,
	};
}
