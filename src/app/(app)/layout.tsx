import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ensureDbReady } from "@/lib/dbInit";
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

  await ensureDbReady(prisma);

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, name: true },
  })

  if (!workspace) {
    redirect("/login")
  }

  // Check if user signed in with Google
  const googleAccount = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "google",
    },
  })

  const user = await prisma.user.findUnique({
		where: { id: session.user.id },
		select: { name: true, email: true, isGuest: true, guestLastActiveAt: true },
  });

  // Check if user needs to provide name (magic link users without name)
  const isGuestUser = Boolean(user?.isGuest);
  const needsName = !isGuestUser && !user?.name && !googleAccount;

  return (
		<AppShell
			workspaceId={workspace.id}
			workspaceName={workspace.name}
			userEmail={isGuestUser ? "" : (user?.email ?? session.user.email ?? "")}
			userName={user?.name ?? ""}
			isGoogleUser={!!googleAccount}
			isGuestUser={isGuestUser}
			needsName={needsName}>
			{children}
		</AppShell>
  );
}
