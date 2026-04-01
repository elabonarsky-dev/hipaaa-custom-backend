import { getEnv } from "../../config";
import { createChildLogger } from "../../utils";

const log = createChildLogger({ module: "sharepoint-auth" });

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getSharePointToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }

  const env = getEnv();

  if (!env.SHAREPOINT_TENANT_ID || !env.SHAREPOINT_CLIENT_ID || !env.SHAREPOINT_CLIENT_SECRET) {
    throw new Error("SharePoint credentials not configured");
  }

  const tokenUrl = `https://login.microsoftonline.com/${env.SHAREPOINT_TENANT_ID}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.SHAREPOINT_CLIENT_ID,
    client_secret: env.SHAREPOINT_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });

  log.info("Acquiring SharePoint access token");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    log.error({ status: response.status, body: errText }, "Token acquisition failed");
    throw new Error(`SharePoint token error: ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}
