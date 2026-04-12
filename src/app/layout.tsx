import type { Metadata, Viewport } from "next";
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
	manifest: "/manifest.webmanifest",
	icons: {
		icon: [
			{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
		],
		shortcut: "/icons/icon-192.png",
		apple: [
			{ url: "/icons/apple-touch-icon.png" },
			{ url: "/icons/apple-touch-icon-152x152.png", sizes: "152x152", type: "image/png" },
			{ url: "/icons/apple-touch-icon-167x167.png", sizes: "167x167", type: "image/png" },
			{ url: "/icons/apple-touch-icon-180x180.png", sizes: "180x180", type: "image/png" },
		],
	},
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark" data-theme="dark">
			<head>
				<meta name="theme-color" media="(prefers-color-scheme: light)" content="#0a0a0a" />
				<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
				<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
				<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-icon-152x152.png" />
				<link rel="apple-touch-icon" sizes="167x167" href="/icons/apple-touch-icon-167x167.png" />
				<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180x180.png" />
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
