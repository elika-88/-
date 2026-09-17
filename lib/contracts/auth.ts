import { z } from 'zod';

export const UserProfileSchema = z.strictObject({
  id: z.string().uuid(),
  username: z.string(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;
