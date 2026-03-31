import { createRequire } from "node:module";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const require = createRequire(import.meta.url);
const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});
const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
	compress: true,
	poweredByHeader: false,
	images: {
		formats: ["image/avif", "image/webp"],
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

export default withBundleAnalyzer(nextConfig);
