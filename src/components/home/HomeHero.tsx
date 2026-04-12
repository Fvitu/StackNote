"use client";

import { useEffect, useState } from "react";

function getGreeting(date: Date) {
	const hour = date.getHours();
	if (hour < 12) {
		return "Good morning";
	}
	if (hour < 18) {
		return "Good afternoon";
	}
	return "Good evening";
}

function getDateLabel(date: Date) {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(date);
}

interface HomeHeroProps {
	displayName: string;
	statusLine: string;
}

export function HomeHero({ displayName, statusLine }: HomeHeroProps) {
	const [timeCopy, setTimeCopy] = useState<{ greeting: string; dateLabel: string } | null>(null);

	useEffect(() => {
		const now = new Date();
		setTimeCopy({
			greeting: getGreeting(now),
			dateLabel: getDateLabel(now),
		});
	}, []);

	return (
		<section
			className="rounded-[28px] border border-white/10 px-6 py-6 sm:px-8 sm:py-7"
			style={{
				background:
					"radial-gradient(120% 120% at 10% 0%, rgba(124,106,255,0.22) 0%, rgba(124,106,255,0.08) 32%, rgba(17,17,17,0.98) 68%), linear-gradient(165deg, #161616 0%, #101010 62%, #0d0d0d 100%)",
			}}>
			<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Home</p>
			<h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2rem]">
				{timeCopy ? `${timeCopy.greeting}, ${displayName}` : "\u00a0"}
			</h1>
			<p className="mt-2 text-sm text-zinc-500">{timeCopy?.dateLabel ?? "\u00a0"}</p>
			<p className="mt-4 text-sm text-zinc-400">{statusLine}</p>
		</section>
	);
}
