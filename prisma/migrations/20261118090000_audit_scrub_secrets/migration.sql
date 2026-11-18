-- The audit trail copied the before/after values of credential fields into
-- audit_logs.changes: password hashes, authenticator secrets and the
-- encrypted "secret:…" settings (LINE, Google, AI and PageSpeed keys).
-- lib/audit/extension.ts no longer records them; this removes the copies
-- already stored. changedFields is untouched, so each entry still says
-- which field changed and who changed it.

UPDATE "audit_logs"
SET "changes" = "changes" - ARRAY['passwordHash', 'totpSecret', 'totpLastStep', 'codeHash', 'access_token', 'refresh_token', 'id_token', 'sessionToken', 'token']
WHERE "changes" IS NOT NULL
  AND jsonb_typeof("changes") = 'object'
  AND jsonb_exists_any("changes", ARRAY['passwordHash', 'totpSecret', 'totpLastStep', 'codeHash', 'access_token', 'refresh_token', 'id_token', 'sessionToken', 'token']);

-- Settings entries carry no key of their own in the trail, so the stored
-- credentials are recognised by their shape: every one is written as
-- "v1:<iv>:<tag>:<ciphertext>".
UPDATE "audit_logs"
SET "changes" = "changes" - 'value'
WHERE "model" = 'SiteSetting'
  AND "changes" IS NOT NULL
  AND jsonb_typeof("changes") = 'object'
  AND (
    "changes" #>> '{value,before}' LIKE 'v1:%'
    OR "changes" #>> '{value,after}' LIKE 'v1:%'
  );
