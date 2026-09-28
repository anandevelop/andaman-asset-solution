"use client";

/**
 * components/admin/UserForm.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Create and edit an account. The password field only appears on create;
 * changing an existing password goes through PasswordForm, so a routine
 * name correction can never silently reset someone's credentials.
 *
 * It is also where an account is tied to a SalesPerson profile, which is
 * what makes it eligible to be handed a lead. That field follows the role
 * being chosen rather than the role the page loaded with — see canHoldLeads
 * below for why VIEWER has no such field at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { Role } from "@prisma/client";
import { hasRole } from "@/lib/role-rank";
import { ROLES } from "@/lib/validations";
import SaveToast from "@/components/admin/SaveToast";
import type { UserFormState } from "@/app/[locale]/admin/(system)/users/actions";

type Props = {
  action: (state: UserFormState, formData: FormData) => Promise<UserFormState>;
  mode: "create" | "edit";
  values?: {
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    /** The SalesPerson profile this account is, or null. */
    salesPersonId?: string | null;
  };
  /**
   * Profiles this account may be linked to: the unclaimed ones, plus
   * whichever one it already holds. Names are already resolved to the
   * viewing locale by the page.
   */
  salesPeople?: { id: string; name: string }[];
  /** True when this row is the signed-in user — role and active are frozen. */
  isSelf?: boolean;
  /** True when demoting this user would leave no super admin. */
  isLastSuperAdmin?: boolean;
  submitLabel: string;
};

const INITIAL: UserFormState = { ok: false };

const EMPTY = { name: "", email: "", role: "EDITOR", isActive: true, salesPersonId: null };

function SubmitButton({ label }: { label: string }) {
  const t = useTranslations("admin.common");
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className="admin-btn">
      {pending ? (
        <>
          <Loader2 size={15} className="animate-spin" aria-hidden />
          {t("saving")}
        </>
      ) : (
        label
      )}
    </button>
  );
}

export default function UserForm({
  action,
  mode,
  values = EMPTY,
  salesPeople = [],
  isSelf = false,
  isLastSuperAdmin = false,
  submitLabel,
}: Props) {
  const t = useTranslations("admin");
  const [state, formAction] = useActionState(action, INITIAL);

  /*
    Tracked in state rather than read once at mount: the sales-profile field
    below appears and disappears with the role being chosen, and an admin
    promoting a VIEWER to SALES expects it to show up without a reload.
  */
  const [role, setRole] = useState(values.role);

  // Freezing role/active for these two cases keeps the UI honest about a
  // rule the server enforces anyway.
  const locked = isSelf || isLastSuperAdmin;

  /*
    VIEWER is the one role that cannot be handed a lead, so it is the one
    role with no profile to link. Leaving the field out for VIEWER also
    means demoting a salesperson releases their profile for somebody else,
    rather than leaving it claimed by an account that can no longer act on
    it — an absent field parses to null, which is the unlink.
  */
  const canHoldLeads = hasRole(role as Role, "SALES");

  const err = (name: string) => {
    const code = state.fields?.[name];
    if (!code) return null;
    if (code === "EMAIL_TAKEN") return t("users.emailTaken");
    if (code === "SALES_PERSON_TAKEN") return t("users.salesPersonTaken");
    return code;
  };

  const banner = (() => {
    if (state.ok) return { tone: "ok" as const, text: t("common.saved") };
    switch (state.message) {
      case "CANNOT_DEMOTE_SELF":
        return { tone: "bad" as const, text: t("users.cannotDemoteSelf") };
      case "LAST_SUPER_ADMIN":
        return { tone: "bad" as const, text: t("users.lastSuperAdmin") };
      case "SAVE_FAILED":
      case "NOT_FOUND":
        return { tone: "bad" as const, text: t("common.error") };
      default:
        return null;
    }
  })();

  return (
    <form action={formAction} className="space-y-5">
      {banner && (
        <SaveToast tone={banner.tone === "ok" ? "success" : "error"} token={state}>
          {banner.tone === "ok" ? (
            <CheckCircle2 size={15} aria-hidden />
          ) : (
            <AlertCircle size={15} aria-hidden />
          )}
          {banner.text}
        </SaveToast>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="admin-label">
            {t("users.name")}
          </label>
          <input
            id="name"
            name="name"
            defaultValue={values.name}
            required
            autoComplete="off"
            className="admin-input"
          />
          {err("name") && (
            <p className="mt-1.5 text-xs text-red-700">{err("name")}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="admin-label">
            {t("users.email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            required
            autoComplete="off"
            className="admin-input"
          />
          {err("email") && (
            <p className="mt-1.5 text-xs text-red-700">{err("email")}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="role" className="admin-label">
          {t("users.role")}
        </label>
        <select
          id="role"
          name="role"
          defaultValue={values.role}
          onChange={(event) => setRole(event.target.value)}
          disabled={locked}
          className="admin-input max-w-xs disabled:bg-surface-muted disabled:text-ink-muted"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`roles.${role}` as never)}
            </option>
          ))}
        </select>

        {/* A disabled control submits nothing, so mirror the value. */}
        {locked && <input type="hidden" name="role" value={values.role} />}

        {isSelf && <p className="admin-hint">{t("users.selfLocked")}</p>}
        {!isSelf && isLastSuperAdmin && (
          <p className="admin-hint">{t("users.lastSuperAdminHint")}</p>
        )}
      </div>

      {/* ── Which salesperson this account is ───────────────────────── */}
      {canHoldLeads && (
        <div>
          <label htmlFor="salesPersonId" className="admin-label">
            {t("users.salesPerson")}
          </label>
          <select
            id="salesPersonId"
            name="salesPersonId"
            defaultValue={values.salesPersonId ?? ""}
            className="admin-input max-w-xs"
          >
            <option value="">{t("users.salesPersonNone")}</option>
            {salesPeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <p className="admin-hint">{t("users.salesPersonHint")}</p>
          {err("salesPersonId") && (
            <p className="mt-1.5 text-xs text-red-700">{err("salesPersonId")}</p>
          )}
        </div>
      )}

      {mode === "create" && (
        <div>
          <label htmlFor="password" className="admin-label">
            {t("users.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="admin-input max-w-md"
          />
          <p className="admin-hint">{t("users.passwordHint")}</p>
          {err("password") && (
            <p className="mt-1.5 text-xs text-red-700">{err("password")}</p>
          )}
        </div>
      )}

      <label className="flex items-start gap-3 text-sm text-ink">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={values.isActive}
          disabled={locked}
          className="mt-0.5 h-4 w-4 rounded-xs border-primary/30 text-primary focus:ring-primary/30"
        />
        <span>
          {t("users.isActive")}
          <span className="mt-0.5 block text-xs text-ink-muted">
            {t("users.isActiveHint")}
          </span>
        </span>
      </label>

      {locked && values.isActive && (
        <input type="hidden" name="isActive" value="on" />
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
