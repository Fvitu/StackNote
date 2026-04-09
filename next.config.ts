import { createRequire } from "node:module";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import withPWA from "@ducanh2912/next-pwa";

const require = createRequire(import.meta.url);
const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});
const withStackNotePWA = withPWA({
	dest: "public",
	disable: process.env.NODE_ENV === "development",
	cacheOnFrontEndNav: true,
	aggressiveFrontEndNavCaching: true,
	reloadOnOnline: true,
	workboxOptions: {
		disableDevLogs: true,
		runtimeCaching: [
			{
				urlPattern: ({ request, url }) => request.method === "GET" && url.pathname.startsWith("/api/notes/"),
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "notes-cache",
					expiration: {
						maxEntries: 200,
						maxAgeSeconds: 7 * 24 * 60 * 60,
					},
				},
			},
			{
				urlPattern: ({ request, url }) => request.method === "GET" && /^\/api\/workspace\/.+\/tree$/.test(url.pathname),
				handler: "StaleWhileRevalidate",
				options: {
					cacheName: "workspace-cache",
				},
			},
			{
				urlPattern: ({ request, url }) => request.method === "GET" && url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/"),
				handler: "CacheFirst",
				options: {
					cacheName: "media-cache",
					expiration: {
						maxEntries: 100,
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
