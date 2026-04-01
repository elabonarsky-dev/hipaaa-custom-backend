import { z } from "zod";

/**
 * Minimal schema for the critical fields we need from JotForm payloads.
 * The raw payload is forwarded to VanillaSoft as-is — we only extract
 * what we need for dedup, member matching, and routing.
 */
export const jotformPayloadSchema = z.object({
  submissionID: z.string().optional(),
  formID: z.string().optional(),

  cin: z.string().optional(),
  medicaid_id: z.string().optional(),
  medicaidId: z.string().optional(),
  CIN: z.string().optional(),

  first_name: z.string().optional(),
  firstName: z.string().optional(),
  last_name: z.string().optional(),
  lastName: z.string().optional(),

  dob: z.string().optional(),
  date_of_birth: z.string().optional(),
  dateOfBirth: z.string().optional(),

  phone: z.string().optional(),
  phone_number: z.string().optional(),
  email: z.string().optional(),

  file_urls: z.union([z.string(), z.array(z.string())]).optional(),
  fileUrls: z.union([z.string(), z.array(z.string())]).optional(),
});

export type JotformPayload = z.infer<typeof jotformPayloadSchema>;

export interface NormalizedFields {
  submissionId: string | null;
  cinRaw: string | null;
  firstName: string;
  lastName: string;
  dob: string | null;
  phone: string | null;
  email: string | null;
  fileUrls: string[];
}

/**
 * Extract and coalesce the fields we need from the flexible JotForm payload.
 * JotForm payloads can use different naming conventions depending on form setup.
 */
export function extractFields(payload: JotformPayload): NormalizedFields {
  const cinRaw =
    payload.cin ?? payload.CIN ?? payload.medicaid_id ?? payload.medicaidId ?? null;

  const firstName =
    payload.first_name ?? payload.firstName ?? "";

  const lastName =
    payload.last_name ?? payload.lastName ?? "";

  const dob =
    payload.dob ?? payload.date_of_birth ?? payload.dateOfBirth ?? null;

  const phone =
    payload.phone ?? payload.phone_number ?? null;

  const rawFiles = payload.file_urls ?? payload.fileUrls;
  let fileUrls: string[] = [];
  if (typeof rawFiles === "string") {
    fileUrls = rawFiles.split(",").map((u) => u.trim()).filter(Boolean);
  } else if (Array.isArray(rawFiles)) {
    fileUrls = rawFiles.filter(Boolean);
  }

  return {
    submissionId: payload.submissionID ?? null,
    cinRaw,
    firstName,
    lastName,
    dob,
    phone: phone ?? null,
    email: payload.email ?? null,
    fileUrls,
  };
}
