import { QueryClient } from "@tanstack/react-query";

export function createStackNoteQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				networkMode: "offlineFirst",
				staleTime: 1000 * 60 * 5,
				gcTime: 1000 * 60 * 60 * 24,
				refetchOnWindowFocus: false,
				retry: 1,
			},
			mutations: {
				networkMode: "offlineFirst",
			},
		},
	});
}
