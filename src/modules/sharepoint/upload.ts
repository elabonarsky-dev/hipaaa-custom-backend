import { getEnv } from "../../config";
import { createChildLogger, maskCin } from "../../utils";
import { getSharePointToken } from "./auth";
import type { PrismaClient } from "@/prisma";

const log = createChildLogger({ module: "sharepoint-upload" });

export interface SharePointUploadResult {
  success: boolean;
  sharepointUrl?: string;
  sharepointPath?: string;
  error?: string;
}

/**
 * Downloads a file from JotForm and uploads it to SharePoint via Microsoft Graph API.
 *
 * Folder structure: CareCollab/{CIN}/{FormType}/{SubmissionID}/
 *
 * This is fire-and-forget from the main flow — failure does NOT block
 * the VanillaSoft forward.
 */
export async function uploadFileToSharePoint(
  fileUrl: string,
  cinNormalized: string,
  formType: string,
  submissionId: string
): Promise<SharePointUploadResult> {
  const env = getEnv();

  if (!env.SHAREPOINT_SITE_ID || !env.SHAREPOINT_DRIVE_ID) {
    log.warn("SharePoint not configured, skipping upload");
    return { success: false, error: "SharePoint not configured" };
  }

  try {
    const token = await getSharePointToken();

    log.info(
      { cin: maskCin(cinNormalized), formType, submissionId },
      "Downloading file from JotForm"
    );
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file: ${fileResponse.status}`);
    }

    const contentType =
      fileResponse.headers.get("content-type") ?? "application/octet-stream";
    const fileBuffer = await fileResponse.arrayBuffer();

    const fileName = extractFileName(fileUrl);
    const folderPath = `CareCollab/${cinNormalized}/${formType}/${submissionId}`;
    const uploadPath = `${folderPath}/${fileName}`;
    const encodedPath = encodeGraphDrivePath(uploadPath);

    log.info({ uploadPath, size: fileBuffer.byteLength }, "Uploading to SharePoint");

    const graphUrl =
      `https://graph.microsoft.com/v1.0/sites/${env.SHAREPOINT_SITE_ID}` +
      `/drives/${env.SHAREPOINT_DRIVE_ID}` +
      `/root:/${encodedPath}:/content`;

    const uploadResponse = await fetch(graphUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: fileBuffer,
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.text();
      log.error({ status: uploadResponse.status, body: errBody }, "SharePoint upload failed");
      throw new Error(`SharePoint upload failed: ${uploadResponse.status}`);
    }

    const result = (await uploadResponse.json()) as {
      webUrl: string;
      parentReference?: { path?: string };
    };

    log.info({ uploadPath, webUrl: result.webUrl }, "SharePoint upload succeeded");

    return {
      success: true,
      sharepointUrl: result.webUrl,
      sharepointPath: uploadPath,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    log.error({ err, cin: maskCin(cinNormalized) }, "SharePoint upload error");
    return { success: false, error: errorMsg };
  }
}

export async function processSharePointUploads(
  db: PrismaClient,
  memberId: string,
  fileUrls: string[],
  cinNormalized: string,
  formType: string,
  submissionId: string
): Promise<void> {
  for (const fileUrl of fileUrls) {
    const docRecord = await db.sharePointDocument.create({
      data: {
        memberId,
        jotformFileUrl: fileUrl,
        status: "UPLOADING",
        fileName: extractFileName(fileUrl),
      },
    });

    const result = await uploadFileToSharePoint(
      fileUrl,
      cinNormalized,
      formType,
      submissionId
    );

    await db.sharePointDocument.update({
      where: { id: docRecord.id },
      data: {
        status: result.success ? "UPLOADED" : "FAILED",
        sharepointUrl: result.sharepointUrl ?? null,
        sharepointPath: result.sharepointPath ?? null,
        errorMessage: result.error ?? null,
      },
    });
  }
}

/** Encode each path segment for Microsoft Graph `root:/path:/content` (spaces, unicode, etc.). */
function encodeGraphDrivePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function extractFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    return segments[segments.length - 1] ?? "file";
  } catch {
    return "file";
  }
}
