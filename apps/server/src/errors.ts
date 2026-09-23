import type { FastifyReply } from "fastify";
import type { ApiError, ErrorCode } from "@dhruv/shared";

/** Section 15 error shape: { error: { code, message, details? } }. */
export function sendError(reply: FastifyReply, status: number, code: ErrorCode, message: string, details?: unknown) {
  const body: ApiError = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return reply.code(status).send(body);
}
