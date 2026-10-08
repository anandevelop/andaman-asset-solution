/**
 * components/club/types.ts — what the portal's server actions hand back to
 * their forms. Types only; shared by app/[locale]/club/actions.ts and the
 * client forms.
 */

export type CodeState = { error?: "format" | "notFound" | "locked"; left?: number };

export type SendOtpState = {
  /** Masked address the last code went to. */
  sentTo?: string;
  error?: "noPending" | "noEmail" | "tooMany" | "locked" | "unknownEmail";
  /** Changes on every send so the form can react to a resend. */
  at?: number;
};

export type VerifyOtpState = {
  error?: "noPending" | "format" | "wrong" | "expired" | "locked";
  left?: number;
};

export type MemberState = {
  ok?: boolean;
  error?: "invalid" | "duplicate" | "full" | "ownerOnly";
  at?: number;
};

/** A household address as the OTP picker shows it — never the full email. */
export type OtpRecipient = { index: number; masked: string; relation: string };
