import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "StackNote",
	description: "Your intelligent study workspace",
	icons: {
		icon: "/StackNote.png",
		shortcut: "/StackNote.png",
		apple: "/StackNote.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark" data-theme="dark">
			<body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
				<TooltipProvider>
					{children}
					<Analytics />
				</TooltipProvider>
			</body>
		</html>
	);
}
