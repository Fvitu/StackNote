import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
});

export const metadata: Metadata = {
	title: "StackNote",
	description: "Your intelligent study workspace",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark" data-theme="dark">
			<body className={`${inter.variable} font-sans antialiased`}>
				<TooltipProvider>{children}</TooltipProvider>
			</body>
		</html>
	);
}
