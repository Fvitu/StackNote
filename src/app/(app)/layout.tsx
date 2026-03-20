import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
		select: { name: true, email: true },
  });

  // Check if user needs to provide name (magic link users without name)
  const needsName = !user?.name && !googleAccount;

  return (
		<AppShell
			workspaceId={workspace.id}
			workspaceName={workspace.name}
			userEmail={user?.email ?? session.user.email ?? ""}
			userName={user?.name ?? ""}
			isGoogleUser={!!googleAccount}
			needsName={needsName}>
			{children}
		</AppShell>
  );
}
