import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { getCurrentWorkspace } from "@/lib/server-data";
import { AppShell } from "./AppShell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect("/login?reason=session-expired");
  }
  const workspace = await getCurrentWorkspace(session.user.id);

  return (
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
  );
}
