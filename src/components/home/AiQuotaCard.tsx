"use client";

import { Settings } from "lucide-react";
import { useSettingsDock } from "@/contexts/SettingsDockContext";
import { Separator } from "@/components/ui/separator";

interface UsageMetric {
	label: string;
	used: number;
	limit: number;
	display: string;
}

interface AiQuotaCardProps {
	metrics: UsageMetric[];
}

export function AiQuotaCard({ metrics }: AiQuotaCardProps) {
	const { openSettingsDock } = useSettingsDock();

	return (
		<section className="rounded-[24px] border border-white/5 bg-[#111111] p-5">
			<div className="space-y-2">
				<p className="text-xs font-medium uppercase tracking-widest text-zinc-500">AI Usage</p>
				<p className="text-sm text-zinc-400">Today&apos;s message, token, and transcription limits.</p>
			</div>

			<div className="mt-5 space-y-4">
				{metrics.map((metric) => {
					const ratio = metric.limit > 0 ? Math.min(1, metric.used / metric.limit) : 0;

					return (
						<div key={metric.label} className="space-y-2">
							<div className="flex items-center justify-between gap-3 text-sm">
								<span className="text-zinc-400">{metric.label}</span>
								<span className="text-zinc-500">{metric.display}</span>
							</div>
							<div className="h-2 overflow-hidden rounded-full bg-white/5">
								<div
									className="h-full rounded-full bg-[#7c6aff] transition-[width] duration-300"
									style={{ width: `${ratio * 100}%` }}
								/>
							</div>
						</div>
					);
				})}
			</div>

			<Separator className="my-5 bg-white/5" />

			<div className="flex items-center justify-between gap-3 text-xs">
				<span className="text-zinc-600">Resets tomorrow</span>
				<button type="button" onClick={openSettingsDock} className="inline-flex items-center gap-2 text-sm text-violet-400 transition-colors hover:text-violet-300">
					<Settings className="h-3.5 w-3.5" />
					Open Settings
				</button>
			</div>
		</section>
	);
}
