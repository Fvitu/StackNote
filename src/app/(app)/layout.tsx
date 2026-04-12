import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookie";
import { getCurrentWorkspace } from "@/lib/server-data";
import { AppShell } from "./AppShell";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SyncEngineProvider } from "@/contexts/SyncEngineContext";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	if (!session?.user?.id) {
		const cookieStore = await cookies();
		const hadSessionCookie = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
		redirect(hadSessionCookie ? "/login?reason=session-expired" : "/login");
	}
	const workspace = await getCurrentWorkspace(session.user.id);

	return (
		<QueryProvider>
			<SyncEngineProvider>
				<AppShell
					initialShell={{
						workspaceName: workspace?.name ?? "Workspace",
						userName: session.user.name,
						userEmail: session.user.email ?? "",
						isGuestUser: session.user.isGuest,
						isGoogleUser: session.user.isGoogleUser,
						needsName: !session.user.isGuest && !session.user.name && !session.user.isGoogleUser,
					}}>
					{children}
				</AppShell>
			</SyncEngineProvider>
		</QueryProvider>
	);
}
