export async function readJsonResponse<T>(response: Response): Promise<T | null> {
	const body = await response.text().catch(() => "");

	if (!body.trim()) {
		return null;
	}

	try {
		return JSON.parse(body) as T;
	} catch {
		return null;
	}
}

export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
	const payload = await readJsonResponse<{ error?: string; message?: string }>(response);
	return payload?.error ?? payload?.message ?? fallback;
}
