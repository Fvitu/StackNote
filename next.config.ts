import { createRequire } from "node:module";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import withPWA from "@ducanh2912/next-pwa";

const require = createRequire(import.meta.url);
const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});
const disablePWA = process.env.NODE_ENV === "development" || process.env.VERCEL === "1";

const withStackNotePWA = withPWA({
	dest: "public",
	disable: disablePWA,
	cacheOnFrontEndNav: true,
	aggressiveFrontEndNavCaching: true,
	reloadOnOnline: false,
	workboxOptions: {
		disableDevLogs: true,
		navigateFallback: "/offline",
		navigateFallbackDenylist: [/^\/api\//],
		runtimeCaching: [
			{
				urlPattern: ({ request, url }) => request.method === "GET" && url.pathname.startsWith("/api/auth/"),
				handler: "NetworkOnly",
				options: {
					cacheName: "auth-network-only",
				},
			},
			{
				urlPattern: ({ request, url }) =>
					request.method === "GET" &&
					typeof self !== "undefined" &&
					url.origin === self.location.origin &&
					!url.pathname.startsWith("/api/") &&
					(request.destination === "document" || request.destination === "script" || request.destination === "style"),
				handler: "CacheFirst",
				options: {
					cacheName: "app-shell-cache",
					expiration: {
						maxEntries: 300,
						maxAgeSeconds: 30 * 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: ({ request, url }) =>
					request.method === "GET" && (url.pathname === "/api/notes" || url.pathname.startsWith("/api/notes/") || url.pathname === "/api/blocks"),
				handler: "NetworkFirst",
				options: {
					cacheName: "notes-blocks-api-cache",
					networkTimeoutSeconds: 3,
					expiration: {
						maxEntries: 200,
						maxAgeSeconds: 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: ({ request, url }) =>
					request.method === "GET" &&
					(request.destination === "font" || request.destination === "image" || url.pathname.startsWith("/_next/static/")),
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "static-assets-cache",
				},
			},
			{
				urlPattern: ({ request, url }) =>
					request.method === "GET" && (url.hostname.includes("r2.cloudflarestorage.com") || url.hostname.endsWith(".r2.dev")),
				handler: "CacheFirst",
				options: {
					cacheName: "r2-files-cache",
					expiration: {
						maxEntries: 60,
						maxAgeSeconds: 7 * 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: ({ request, url }) => request.method === "GET" && /^\/sounds\/.+\.mp3$/.test(url.pathname),
				handler: "CacheFirst",
				options: {
					cacheName: "sounds-cache",
					expiration: {
						maxEntries: 10,
						maxAgeSeconds: 30 * 24 * 60 * 60,
					},
				},
			},
		],
	},
});
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
	compress: true,
	poweredByHeader: false,
	images: {
		formats: ["image/avif", "image/webp"],
		remotePatterns: [
			{
				protocol: "https",
				hostname: "**.supabase.co",
				pathname: "/storage/v1/object/**",
			},
		],
	},
	experimental: {
		...(isProd
			? {
					optimizePackageImports: ["lucide-react", "@base-ui/react"],
			  }
			: {}),
	},
	turbopack: {},
	webpack: (config, { isServer }) => {
		config.resolve.alias = {
			...config.resolve.alias,
			...(!isServer
				? {
						yjs: require.resolve("yjs"),
				  }
				: {}),
		};

		return config;
	},
};

export default withBundleAnalyzer(withStackNotePWA(nextConfig));
