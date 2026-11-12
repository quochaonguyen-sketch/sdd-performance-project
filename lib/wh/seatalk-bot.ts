type BotConfig = { appId: string; appSecret: string; groupId: string };
type BotReply = {
  code?: number;
  app_access_token?: string;
  thread_id?: string;
  message_id?: string;
  data?: { thread_id?: string; message_id?: string };
};
type Message = { tag: "text"; text: { format: 1; content: string } } | { tag: "image"; image: { content: string } };

export function seatalkBotConfig(): BotConfig | null {
  const appId = process.env.SPX_SEATALK_APP_ID?.trim() || process.env.LMHUB_SEATALK_APP_ID?.trim();
  const appSecret = process.env.SPX_SEATALK_APP_SECRET?.trim() || process.env.LMHUB_SEATALK_APP_SECRET?.trim();
  const groupId = process.env.SPX_SEATALK_GROUP_ID?.trim() || process.env.LMHUB_SEATALK_GROUP_ID?.trim();
  return appId && appSecret && groupId ? { appId, appSecret, groupId } : null;
}

export class SeaTalkError extends Error {
  constructor(message: string, readonly code?: number, readonly uncertain = false) {
    super(message);
  }
}

async function request(path: string, payload: object, token?: string) {
  const action = token ? "gửi tin" : "xác thực bot";
  let response: Response;
  try {
    response = await fetch(`https://openapi.seatalk.io${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
  } catch {
    throw new SeaTalkError(`Mất kết nối khi ${action} qua SeaTalk.`, undefined, !!token);
  }
  const body = await response.json().catch(() => null) as BotReply | null;
  const code = typeof body?.code === "number" ? body.code : undefined;
  if (!response.ok || code !== 0) {
    const reason = code === 7001 ? "Bot chưa được thêm vào nhóm SeaTalk."
      : code === 7000 ? "Không tìm thấy nhóm SeaTalk đã cấu hình."
      : code === 4012 ? "Bot thiếu quyền gửi vào nhóm SeaTalk."
      : `SeaTalk báo lỗi khi ${action} (${code && code !== 0 ? `mã ${code}` : `HTTP ${response.status}`}).`;
    throw new SeaTalkError(reason, code, !!token && (response.status >= 500 || (response.ok && code === undefined)));
  }
  return body!;
}

export const seaTalkText = (content: string): Message => ({ tag: "text", text: { format: 1, content } });

export async function connectSeaTalk({ appId, appSecret, groupId }: BotConfig) {
  const { app_access_token: token } = await request("/auth/app_access_token", { app_id: appId, app_secret: appSecret });
  if (typeof token !== "string" || !token) throw new SeaTalkError("SeaTalk không trả về token của bot.");
  return (message: Message, threadId?: string) => request("/messaging/v2/group_chat", {
    group_id: groupId,
    message: threadId ? { ...message, thread_id: threadId } : message,
  }, token);
}

export function seaTalkThreadId(reply: BotReply) {
  const id = reply.thread_id || reply.data?.thread_id || reply.message_id || reply.data?.message_id;
  if (typeof id !== "string" || !id) throw new SeaTalkError("SeaTalk không trả về mã luồng báo cáo.", undefined, true);
  return id;
}

export function seaTalkImage(bytes: ArrayBuffer): Message {
  const content = Buffer.from(bytes).toString("base64");
  if (content.length > 5_000_000) throw new SeaTalkError("Ảnh báo cáo vượt giới hạn 5 MB của SeaTalk.");
  return { tag: "image", image: { content } };
}
