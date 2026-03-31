import { readErrorMessage, readJsonResponse } from "@/lib/http";

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, init);
	const payload = await readJsonResponse<T>(response);

	if (!response.ok || payload === null) {
		throw new Error(await readErrorMessage(response, `Request failed: ${response.status}`));
	}

	return payload;
}
