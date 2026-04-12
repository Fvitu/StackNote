import { readErrorMessage, readJsonResponse } from "@/lib/http";

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, init);
	const payload = await readJsonResponse<T>(response);

	if (!response.ok || payload === null) {
		throw new Error(await readErrorMessage(response, `Request failed: ${response.status}`));
	}

	return payload;
}

export async function fetchJsonOrNullOnNotFound<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T | null> {
	const response = await fetch(input, init);
	if (response.status === 404) {
		return null;
	}

	const payload = await readJsonResponse<T>(response);

	if (!response.ok || payload === null) {
		throw new Error(await readErrorMessage(response, `Request failed: ${response.status}`));
	}

	return payload;
}
