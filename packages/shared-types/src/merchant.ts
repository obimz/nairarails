import { z } from "zod";

export const MerchantSignupSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email address"),
  webhookUrl: z.string().url("invalid webhook URL").optional(),
});

export type MerchantSignup = z.infer<typeof MerchantSignupSchema>;

export const MerchantProfileSchema = z.object({
  merchantId: z.string(),
  name: z.string(),
  email: z.string().email(),
  webhookUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});

export type MerchantProfile = z.infer<typeof MerchantProfileSchema>;
