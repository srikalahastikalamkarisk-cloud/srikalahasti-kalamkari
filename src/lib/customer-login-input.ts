import { z } from "zod";

// Normalize before validating so copied addresses with surrounding whitespace
// follow the same lookup rules as registration and password recovery.
export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(191),
  password: z.string().max(128),
  // useSearchParams().get() returns null when the form has no returnTo query.
  returnTo: z.string().max(300).nullable().optional(),
});
