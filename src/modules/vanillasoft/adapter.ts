import { getVsUrl } from "../../config";
import { createChildLogger, maskCin } from "../../utils";
import type { FormType } from "@prisma/client";

const log = createChildLogger({ module: "vanillasoft" });

export interface VsForwardResult {
  success: boolean;
  statusCode: number;
  body: string;
}

/**
 * VanillaSoft Incoming Web Lead Adapter.
 *
 * Forwards the payload as-is to the existing VS Incoming Web Lead endpoint
 * as application/x-www-form-urlencoded. This preserves the 400+ existing
 * field mappings configured in VanillaSoft — we do NOT remap.
 */
export async function forwardToVanillaSoft(
  formType: FormType,
  payload: Record<string, unknown>,
  cinNormalized?: string | null
): Promise<VsForwardResult> {
  const url = getVsUrl(formType);

  log.info(
    { formType, cin: maskCin(cinNormalized), url },
    "Forwarding to VanillaSoft"
  );

  const formBody = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) {
      formBody.append(key, String(value));
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });

    const body = await response.text();

    if (!response.ok) {
      log.error(
        { formType, statusCode: response.status, body },
        "VanillaSoft rejected submission"
      );
    } else {
      log.info(
        { formType, statusCode: response.status },
        "VanillaSoft accepted submission"
      );
    }

    return {
      success: response.ok,
      statusCode: response.status,
      body,
    };
  } catch (err) {
    log.error({ err, formType }, "VanillaSoft network error");
    return {
      success: false,
      statusCode: 0,
      body: err instanceof Error ? err.message : "Unknown network error",
    };
  }
}
