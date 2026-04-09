function getGreeting() {
	const hour = new Date().getHours();
	if (hour < 12) {
		return "Good morning";
	}
	if (hour < 18) {
		return "Good afternoon";
	}
	return "Good evening";
}

function getDateLabel() {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	}).format(new Date());
}

interface HomeHeroProps {
	displayName: string;
	statusLine: string;
}

export function HomeHero({ displayName, statusLine }: HomeHeroProps) {
	return (
		<section
			className="rounded-[28px] border border-white/10 px-6 py-6 sm:px-8 sm:py-7"
			style={{
				background:
					"radial-gradient(120% 120% at 10% 0%, rgba(124,106,255,0.22) 0%, rgba(124,106,255,0.08) 32%, rgba(17,17,17,0.98) 68%), linear-gradient(165deg, #161616 0%, #101010 62%, #0d0d0d 100%)",
			}}>
			<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Home</p>
			<h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-[2rem]">
				{getGreeting()}, {displayName}
			</h1>
			<p className="mt-2 text-sm text-zinc-500">{getDateLabel()}</p>
			<p className="mt-4 text-sm text-zinc-400">{statusLine}</p>
		</section>
	);
}
