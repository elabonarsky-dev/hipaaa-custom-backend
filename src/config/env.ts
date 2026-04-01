import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  VS_REFERRAL_POST_URL: z
    .string()
    .url()
    .default("https://s2.vanillasoft.net/web/post.aspx?id=1007863"),
  VS_INTAKE_POST_URL: z
    .string()
    .url()
    .default("https://s2.vanillasoft.net/web/post.aspx?id=1007862"),
  VS_ENROLLMENT_POST_URL: z
    .string()
    .url()
    .default("https://s2.vanillasoft.net/web/post.aspx?id=1007864"),

  JOTFORM_API_KEY: z.string().optional(),
  JOTFORM_WEBHOOK_SECRET: z.string().optional(),

  SHAREPOINT_CLIENT_ID: z.string().optional(),
  SHAREPOINT_CLIENT_SECRET: z.string().optional(),
  SHAREPOINT_TENANT_ID: z.string().optional(),
  SHAREPOINT_SITE_ID: z.string().optional(),
  SHAREPOINT_DRIVE_ID: z.string().optional(),

  ADMIN_API_KEY: z.string().min(1).default("changeme"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}

export function getVsUrl(formType: "REFERRAL" | "INTAKE" | "ENROLLMENT"): string {
  const env = getEnv();
  const urls: Record<string, string> = {
    REFERRAL: env.VS_REFERRAL_POST_URL,
    INTAKE: env.VS_INTAKE_POST_URL,
    ENROLLMENT: env.VS_ENROLLMENT_POST_URL,
  };
  return urls[formType];
}
