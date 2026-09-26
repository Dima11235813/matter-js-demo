import {
    AccountExport, ApiError, ClaimResponse, DeleteResponse, PullResponse, PushResponse,
    type ClaimRequest, type PushRequest,
} from "@lexical/shared";
import type { z } from "zod";

/**
 * The web app's side of the API (Epic 3 · Feature 3.8). Same-origin `/api/v1` (Vite proxies it in dev; the
 * Worker routes it in production). Responses are validated with the shared schemas, so a server/client
 * mismatch fails loudly here instead of corrupting local data.
 */
export class ApiRequestError extends Error {
    constructor(readonly status: number, readonly code: string, message: string) {
        super(message);
    }
}

export class ApiClient {
    constructor(
        private readonly getToken: () => Promise<string | undefined>,
        private readonly base = "/api/v1",
        /** Injectable for tests (the server app's in-process `request`). */
        private readonly fetchFn: (url: string, init: RequestInit) => Promise<Response> = (url, init) => fetch(url, init),
    ) {}

    claim(body: ClaimRequest) {
        return this.request("POST", "/devices/claim", ClaimResponse, body);
    }

    push(body: PushRequest) {
        return this.request("POST", "/sync/push", PushResponse, body);
    }

    pull(since?: string) {
        return this.request("GET", `/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ""}`, PullResponse);
    }

    exportAccount() {
        return this.request("GET", "/me/export", AccountExport);
    }

    deleteAccount() {
        return this.request("DELETE", "/me", DeleteResponse);
    }

    private async request<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
        const token = await this.getToken();
        if (!token) throw new ApiRequestError(401, "signed-out", "Sign in first");
        let response: Response;
        try {
            response = await this.fetchFn(`${this.base}${path}`, {
                method,
                headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch {
            throw new ApiRequestError(0, "offline", "Can't reach the server");
        }
        const json = await response.json().catch(() => undefined);
        if (!response.ok) {
            const error = ApiError.safeParse(json);
            throw new ApiRequestError(response.status, error.success ? error.data.error.code : "http-error", error.success ? error.data.error.message : `HTTP ${response.status}`);
        }
        return schema.parse(json);
    }
}
