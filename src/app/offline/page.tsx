export default function OfflinePage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4 py-10 text-[#f3f3f3]">
			<div className="w-full max-w-2xl rounded-2xl border border-[#242424] bg-[#0f0f0f] p-6 shadow-2xl">
				<h1 className="text-2xl font-semibold text-[#f7f7f7]">You're offline</h1>
				<p className="mt-2 text-sm text-[#b8b8b8]">StackNote is running in offline mode. You can keep studying and editing while disconnected.</p>

				<div className="mt-6 grid gap-4 sm:grid-cols-2">
					<section className="rounded-xl border border-[#272727] bg-[#111111] p-4">
						<h2 className="text-sm font-semibold text-[#7c6aff]">Available offline</h2>
						<ul className="mt-2 space-y-1 text-sm text-[#d4d4d4]">
							<li>View cached notes</li>
							<li>Edit cached notes</li>
							<li>Create new notes</li>
							<li>Flashcard review from cache</li>
						</ul>
					</section>
					<section className="rounded-xl border border-[#272727] bg-[#111111] p-4">
						<h2 className="text-sm font-semibold text-[#7c6aff]">Unavailable offline</h2>
						<ul className="mt-2 space-y-1 text-sm text-[#d4d4d4]">
							<li>AI features</li>
							<li>New file uploads</li>
							<li>Real-time sync</li>
						</ul>
					</section>
				</div>
			</div>
		</main>
	);
}
