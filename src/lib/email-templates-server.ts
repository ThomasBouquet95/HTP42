import { getEmailTemplateDef, renderEmail, type EmailVars } from "./email-templates";
import { getEmailTemplateOverride } from "./airtable";

// Server-side bridge: given a template key + runtime vars, load any admin
// override from Airtable and render the ready-to-send subject + bodies. Falls
// back to the coded defaults when no override is saved.
export async function resolveEmail(
  key: string,
  vars: EmailVars,
): Promise<{ subject: string; textBody: string; htmlBody: string }> {
  const def = getEmailTemplateDef(key);
  if (!def) throw new Error(`Unknown email template: ${key}`);
  let override: { subject: string; body: string } | null = null;
  try {
    override = await getEmailTemplateOverride(key);
  } catch {
    override = null;
  }
  return renderEmail(def, override, vars);
}
