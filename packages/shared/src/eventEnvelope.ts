import { z } from "zod";

/**
 * Placeholder envelope shape (section 2.5 of the Paridhi v2 architecture doc).
 * Owned by A — event *types* and their payload schemas belong here.
 * C (backend) only depends on this shape to persist and order events;
 * do not add rule-specific payload validation from the backend package.
 */
export const eventPrioritySchema = z.number().int().min(0).max(5);

export const eventEnvelopeSchema = z.object({
  device_id: z.string(),
  seq: z.number().int().nonnegative(),
  observed_at: z.string().datetime(),
  priority: eventPrioritySchema,
  type: z.string(),
  payload: z.record(z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
