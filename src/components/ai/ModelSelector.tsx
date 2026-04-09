"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { TEXT_MODELS, type TextModelId } from "@/lib/groq-models";

interface ModelSelectorProps {
	value: TextModelId;
	onChange: (model: TextModelId) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const selectedModel = TEXT_MODELS.find((m) => m.id === value) ?? TEXT_MODELS[0];

	// Close dropdown when clicking outside
	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleSelect = (modelId: TextModelId) => {
		onChange(modelId);
		setIsOpen(false);

		// Persist preference to API
		fetch("/api/settings", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ preferredTextModel: modelId }),
		}).catch(console.error);
	};

	return (
		<div className="relative" ref={dropdownRef}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#1a1a1a]"
				style={{ color: "var(--text-secondary)" }}>
				<span className="max-w-[120px] truncate">{selectedModel.name}</span>
				<ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
			</button>

			{isOpen && (
				<div
					className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border py-1 shadow-lg"
					style={{
						backgroundColor: "var(--bg-surface)",
						borderColor: "var(--border-default)",
					}}>
					{TEXT_MODELS.map((model) => (
						<button
							key={model.id}
							onClick={() => handleSelect(model.id)}
							className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[#1a1a1a]">
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
										{model.name}
									</span>
									{model.default && (
										<span
											className="rounded px-1.5 py-0.5 text-[10px] font-medium"
											style={{
												backgroundColor: "var(--accent-muted)",
												color: "var(--sn-accent)",
											}}>
											Default
										</span>
									)}
								</div>
								<p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
									{model.description}
								</p>
							</div>
							{value === model.id && <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--sn-accent)" }} />}
						</button>
					))}
					<div className="mt-1 border-t px-3 py-2" style={{ borderColor: "var(--border-default)" }}>
						<p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
							All models are free to use
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
