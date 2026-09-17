import { z } from 'zod';
import { ProviderConfigSchema } from './provider';
export const AdminSettingsSchema = ProviderConfigSchema.extend({
  apiFormat: z.enum(['responses', 'chat_completions']),
});
export type AdminSettings = z.infer<typeof AdminSettingsSchema>;
export const SaveAdminSettingsSchema = AdminSettingsSchema.extend({
  apiKey: z.string().max(4096),
  revision: z.number().int().min(0),
});
