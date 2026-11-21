/**
 * lib/mcp/tools/core.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The tools every later set depends on: who am I, the two halves of the
 * deletion rule that a client can reach, and the status of a queued job.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { defineTool, mayUse } from "@/lib/mcp/registry";
import { PERMISSION_MATRIX, type Capability } from "@/lib/permissions";
import { confirmDeletion, deletionStatus } from "@/lib/mcp/deletions";
import { jobStatus } from "@/lib/mcp/jobs";

defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "The account and key this connection is using: role, whether the key may change anything (scope), and which capabilities the role has. Call this first when unsure what you are allowed to do.",
  access: "read",
  input: {},
  handler: async (_args, actor) => ({
    account: actor.name,
    role: actor.role,
    key: actor.tokenName,
    scope: actor.scope,
    capabilities: Object.fromEntries(
      // What this connection may use — narrower than the role where the
      // connection withholds something (lib/mcp/registry.ts).
      (Object.keys(PERMISSION_MATRIX) as Capability[]).map((capability) => [capability, mayUse(actor.role, capability)]),
    ),
  }),
});

defineTool({
  name: "confirm_deletion",
  title: "Confirm a deletion",
  description:
    "Second step of a deletion whose request answered status \"confirmation_required\". Call ONLY after showing the user the summary and receiving an explicit yes in this conversation. The code works once and expires five minutes after it was issued. Requests with status \"approval_required\" cannot be confirmed here.",
  access: "write",
  destructive: true,
  input: {
    requestId: z.string().min(1).max(64).describe("requestId from the deletion request"),
    confirmationCode: z.string().min(1).max(64).describe("confirmationCode from the deletion request"),
  },
  handler: async ({ requestId, confirmationCode }) => {
    const outcome = await confirmDeletion(requestId, confirmationCode);
    if (!outcome.ok) throw new Error(outcome.detail ? `${outcome.error}:${outcome.detail}` : outcome.error);
    return { status: "deleted", deleted: outcome.deleted };
  },
});

defineTool({
  name: "deletion_status",
  title: "Deletion request status",
  description:
    "Where a deletion request stands: PENDING (waiting for confirmation or approval), EXECUTED, REJECTED, EXPIRED or FAILED. Only requests made with this key are visible.",
  access: "read",
  input: { requestId: z.string().min(1).max(64) },
  handler: async ({ requestId }, actor) => {
    const row = await deletionStatus(requestId, actor.tokenId);
    if (!row) throw new Error("NOT_FOUND");
    return row;
  },
});

defineTool({
  name: "job_status",
  title: "Background job status",
  description:
    "Progress of work that was accepted for background processing (for example an image upload): QUEUED, RUNNING, DONE (with its result) or FAILED (with the reason). Only jobs queued with this key are visible.",
  access: "read",
  input: { jobId: z.string().min(1).max(64) },
  handler: async ({ jobId }, actor) => {
    const row = await jobStatus(jobId, actor.tokenId);
    if (!row) throw new Error("NOT_FOUND");
    return row;
  },
});
