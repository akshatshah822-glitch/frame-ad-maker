export async function readJsonResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) throw new Error(`Server error ${response.status}`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    const detail = raw.replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`Server error ${response.status}${detail ? `: ${detail}` : ""}`);
  }
}
