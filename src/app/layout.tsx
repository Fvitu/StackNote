import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppToaster } from "@/components/providers/AppToaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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
	manifest: "/manifest.json",
	icons: {
		icon: "/icons/icon-192.png",
		shortcut: "/icons/icon-192.png",
		apple: "/icons/icon-192.png",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark" data-theme="dark">
			<head>
				<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
				<link rel="manifest" href="/manifest.json" />
				<meta name="theme-color" content="#7c6aff" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
				<link rel="apple-touch-icon" href="/icons/icon-192.png" />
			</head>
			<body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
				<TooltipProvider>
					{children}
					<AppToaster />
				</TooltipProvider>
				<Analytics />
			</body>
		</html>
	);
}
