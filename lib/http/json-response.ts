/** Keep HTML error pages out of user-facing JSON parse errors. HTTP errors stay with the caller. */
export async function readJsonResponse(response: Response, label: string) {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error(`${label}: chưa nhận được dữ liệu (HTTP ${response.status}). Vui lòng tải lại.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: phản hồi dữ liệu không hợp lệ. Vui lòng tải lại.`);
  }
}
