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
    redirect("/login")
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

  // Check if user needs to provide name (magic link users without name)
  const needsName = !session.user.name && !googleAccount

  return (
    <AppShell
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      userEmail={session.user.email ?? ""}
      userName={session.user.name ?? ""}
      isGoogleUser={!!googleAccount}
      needsName={needsName}
    >
      {children}
    </AppShell>
  )
}
