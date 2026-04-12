import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
	const session = await auth();

	if (session?.user?.id) {
		redirect("/");
	}

	return children;
}
