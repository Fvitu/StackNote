"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, BriefcaseBusiness, LogOut, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { GuestInfo } from "@/components/ui/GuestInfo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutAction } from "@/app/actions";

type SaveState = { status: "idle" } | { status: "saving" } | { status: "saved"; message: string } | { status: "error"; message: string };

interface AccountDialogProps {
	open: boolean;
	userName: string;
	userEmail: string;
	workspaceName: string;
	isGoogleUser: boolean;
	isGuestUser: boolean;
	onClose: () => void;
	onSaveUserName: (name: string) => Promise<void>;
	onSaveWorkspaceName: (name: string) => Promise<void>;
}

const IDLE_STATE: SaveState = { status: "idle" };

function getInitials(name: string, email: string): string {
	const source = name.trim() || email.trim() || "User";
	return source
		.split(/\s+/)
		.map((chunk) => chunk[0] ?? "")
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function getStateMessage(state: SaveState, idleMessage: string): string {
	if (state.status === "saved" || state.status === "error") {
		return state.message;
	}

	if (state.status === "saving") {
		return "Saving changes...";
	}

	return idleMessage;
}

export function AccountDialog({
	open,
	userName,
	userEmail,
	workspaceName,
	isGoogleUser,
	isGuestUser,
	onClose,
	onSaveUserName,
	onSaveWorkspaceName,
}: AccountDialogProps) {
	const [nameDraft, setNameDraft] = useState(userName);
	const [workspaceDraft, setWorkspaceDraft] = useState(workspaceName);
	const [profileState, setProfileState] = useState<SaveState>(IDLE_STATE);
	const [workspaceState, setWorkspaceState] = useState<SaveState>(IDLE_STATE);
	const [isSigningOut, setIsSigningOut] = useState(false);

	useEffect(() => {
		if (!open) return;
		setNameDraft(userName);
		setWorkspaceDraft(workspaceName);
		setProfileState(IDLE_STATE);
		setWorkspaceState(IDLE_STATE);
	}, [open, userName, workspaceName]);

	const displayName = userName.trim() || (isGuestUser ? "Guest" : userEmail || "User");
	const providerLabel = isGuestUser ? "Guest" : isGoogleUser ? "Google" : "Magic link";
	const accountEmailLabel = isGuestUser ? "Not required for guest mode" : userEmail;
	const profileDirty = nameDraft.trim() !== userName.trim();
	const workspaceDirty = workspaceDraft.trim() !== workspaceName.trim();

	const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedName = nameDraft.trim();

		if (!trimmedName) {
			setProfileState({ status: "error", message: "Please enter your name." });
			return;
		}

		if (!profileDirty) {
			setProfileState({ status: "saved", message: "Your profile is already up to date." });
			return;
		}

		setProfileState({ status: "saving" });
		try {
			await onSaveUserName(trimmedName);
			toast.success("Name updated");
			setProfileState({ status: "saved", message: "Name updated." });
		} catch {
			toast.error("We couldn't save your name.");
			setProfileState({ status: "error", message: "We couldn't save your name." });
		}
	};

	const handleWorkspaceSave = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmedName = workspaceDraft.trim();

		if (!trimmedName) {
			setWorkspaceState({ status: "error", message: "Please enter a workspace name." });
			return;
		}

		if (!workspaceDirty) {
			setWorkspaceState({ status: "saved", message: "Workspace name is already current." });
			return;
		}

		setWorkspaceState({ status: "saving" });
		try {
			await onSaveWorkspaceName(trimmedName);
			toast.success("Workspace updated");
			setWorkspaceState({ status: "saved", message: "Workspace updated." });
		} catch {
			toast.error("We couldn't save the workspace name.");
			setWorkspaceState({ status: "error", message: "We couldn't save the workspace name." });
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					onClose();
				}
			}}>
			<DialogContent
				showCloseButton={false}
				className="!top-1/2 !left-1/2 !h-[min(92vh,760px)] !max-h-[92vh] !w-[calc(100vw-0.75rem)] sm:!w-[calc(100vw-1.5rem)] !max-w-[min(1080px,95vw)] !-translate-x-1/2 !-translate-y-1/2 !overflow-auto !overflow-x-hidden lg:!overflow-hidden p-0">
				<div className="flex h-full flex-col" style={{ backgroundColor: "var(--bg-surface)", borderRadius: "15px", paddingBottom: "12px" }}>
					<DialogHeader className="border-b px-4 py-4 sm:px-5" style={{ borderColor: "var(--border-default)" }}>
						<DialogTitle className="flex items-center gap-2 text-base">
							<UserRound className="h-4 w-4" />
							Account
						</DialogTitle>
						<DialogDescription>Manage your profile, workspace label, and current sign-in session without leaving the editor.</DialogDescription>
					</DialogHeader>

					<div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
						<div
							className="min-h-0 border-b p-3 sm:p-4 lg:border-r lg:border-b-0 lg:overflow-y-auto"
							style={{ borderColor: "var(--border-default)" }}>
							<div
								className="relative overflow-hidden rounded-[18px] border p-4 sm:p-5"
								style={{
									borderColor: "rgba(124, 106, 255, 0.26)",
									background:
										"radial-gradient(circle at top left, rgba(124, 106, 255, 0.24), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
								}}>
								<div
									className="relative z-10 mb-4 inline-flex max-w-full self-start rounded-full px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] md:absolute md:right-3 md:top-3 md:mb-0"
									style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }}>
									{providerLabel}
								</div>
								<div className="space-y-4 md:pr-16">
									<div
										className="flex h-14 w-14 items-center justify-center rounded-[18px] text-lg font-semibold"
										style={{
											backgroundColor: "rgba(124, 106, 255, 0.18)",
											color: "#d8d1ff",
											boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
										}}>
										{getInitials(userName, userEmail)}
									</div>
									<div className="min-w-0 space-y-1.5">
										<p className="break-words text-base leading-snug font-medium" style={{ color: "var(--text-primary)" }}>
											{displayName}
										</p>
										<p className="break-all text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
											{accountEmailLabel}
										</p>
									</div>
									<div className="space-y-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
										<div className="flex items-start gap-2">
											<ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--sn-accent)" }} />
											<span className="min-w-0 break-words leading-relaxed">Signed in with {providerLabel}</span>
										</div>
										{isGuestUser && (
											<div className="flex items-start">
												<GuestInfo className="w-full">
													Guest sessions are temporary. Notes and uploaded files are deleted after 24 hours of inactivity.
												</GuestInfo>
											</div>
										)}
										<div className="flex items-start gap-2">
											<BriefcaseBusiness className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--sn-accent)" }} />
											<span className="min-w-0 break-words leading-relaxed">Workspace: {workspaceName}</span>
										</div>
									</div>
								</div>
							</div>

							<div className="mt-4 flex flex-col gap-4 sm:mt-5">
								<div
									className="rounded-[14px] border p-4 sm:p-5"
									style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
									<div
										className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em]"
										style={{ color: "var(--text-tertiary)" }}>
										<Sparkles className="h-3.5 w-3.5" />
										Session
									</div>
									<p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
										Your account changes apply immediately across the sidebar and note header.
									</p>
									<div className="mt-4 border-t pt-4" style={{ borderColor: "var(--border-default)" }}>
										<Button
											variant="destructive"
											onClick={async () => {
												setIsSigningOut(true);
												try {
													toast("Signing out...");
													await signOutAction();
												} finally {
													setIsSigningOut(false);
												}
											}}
											disabled={isSigningOut}
											className="h-9 w-full justify-between px-3 text-sm">
											<span>{isSigningOut ? "Signing out..." : "Sign out"}</span>
											<LogOut className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>
						</div>

						<div className="min-h-0 p-3 sm:p-4 md:p-5 lg:overflow-y-auto">
							<div className="space-y-4 sm:space-y-5">
								<form
									onSubmit={handleProfileSave}
									className="rounded-[18px] border p-3.5 sm:p-4"
									style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
										<div className="min-w-0">
											<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
												Profile
											</p>
											<p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
												Update how your name appears around the workspace.
											</p>
										</div>
										<div
											className="max-w-full self-start rounded-full px-2 py-1 text-[11px] leading-relaxed"
											style={{ backgroundColor: "rgba(124, 106, 255, 0.14)", color: "#cfc6ff" }}>
											Visible in the sidebar
										</div>
									</div>

									<div className="mt-4 grid gap-3.5 md:grid-cols-2 md:gap-4">
										<label className="block">
											<span
												className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]"
												style={{ color: "var(--text-tertiary)" }}>
												<UserRound className="h-3.5 w-3.5" />
												Name
											</span>
											<Input
												value={nameDraft}
												onChange={(event) => setNameDraft(event.target.value)}
												placeholder="Your name"
												disabled={profileState.status === "saving"}
											/>
										</label>
										<label className="block">
											<span
												className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]"
												style={{ color: "var(--text-tertiary)" }}>
												<Mail className="h-3.5 w-3.5" />
												Email
											</span>
											<Input value={accountEmailLabel} disabled readOnly />
										</label>
									</div>

									<div className="mt-4 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
										<div
											className="min-w-0 text-xs leading-relaxed"
											style={{
												color:
													profileState.status === "error"
														? "#fca5a5"
														: profileState.status === "saved"
															? "#86efac"
															: "var(--text-tertiary)",
											}}>
											{getStateMessage(profileState, "Changes will update your visible profile instantly.")}
										</div>
										<Button
											type="submit"
											disabled={profileState.status === "saving"}
											className="h-8 w-full px-3 text-xs md:w-auto"
											style={{ backgroundColor: "var(--sn-accent)", color: "white" }}>
											{profileState.status === "saving" ? "Saving..." : "Save profile"}
										</Button>
									</div>
								</form>

								<form
									onSubmit={handleWorkspaceSave}
									className="rounded-[18px] border p-3.5 sm:p-4"
									style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
									<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
										<div className="min-w-0">
											<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
												Workspace
											</p>
											<p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
												Rename the workspace label shown in the sidebar and note breadcrumb.
											</p>
										</div>
										<div
											className="max-w-full self-start rounded-full px-2 py-1 text-[11px] leading-relaxed"
											style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "var(--text-secondary)" }}>
											Single workspace
										</div>
									</div>

									<div className="mt-4">
										<label className="block">
											<span
												className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em]"
												style={{ color: "var(--text-tertiary)" }}>
												<BriefcaseBusiness className="h-3.5 w-3.5" />
												Workspace name
											</span>
											<Input
												value={workspaceDraft}
												onChange={(event) => setWorkspaceDraft(event.target.value)}
												placeholder="Workspace name"
												disabled={workspaceState.status === "saving"}
											/>
										</label>
									</div>

									<div className="mt-4 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
										<div
											className="min-w-0 text-xs leading-relaxed"
											style={{
												color:
													workspaceState.status === "error"
														? "#fca5a5"
														: workspaceState.status === "saved"
															? "#86efac"
															: "var(--text-tertiary)",
											}}>
											{getStateMessage(workspaceState, "This keeps navigation and note context in sync.")}
										</div>
										<Button
											type="submit"
											disabled={workspaceState.status === "saving"}
											variant="outline"
											className="h-8 w-full px-3 text-xs md:w-auto"
											style={{ borderColor: "var(--border-strong)", backgroundColor: "var(--bg-hover)", color: "var(--text-primary)" }}>
											{workspaceState.status === "saving" ? "Saving..." : "Save workspace"}
										</Button>
									</div>
								</form>

								<div
									className="rounded-[18px] border p-3.5 sm:p-4"
									style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
									<p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
										Connected account
									</p>
									<div className="mt-3 grid gap-3 md:grid-cols-2">
										<div
											className="rounded-[14px] border p-3"
											style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
											<p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
												Provider
											</p>
											<p className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
												{!isGuestUser && <BadgeCheck className="h-4 w-4" style={{ color: "var(--sn-accent)" }} />}
												{providerLabel}
											</p>
										</div>
										<div
											className="rounded-[14px] border p-3"
											style={{ borderColor: "var(--border-default)", backgroundColor: "rgba(255,255,255,0.02)" }}>
											<p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
												Account email
											</p>
											<p className="mt-1 text-sm break-all" style={{ color: "var(--text-primary)" }}>
												{accountEmailLabel}
											</p>
										</div>
									</div>
								</div>
							</div>

							<div className="mt-5 flex md:justify-end">
								<Button variant="outline" onClick={onClose} className="h-8 w-full px-3 text-xs md:w-auto">
									Close
								</Button>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
