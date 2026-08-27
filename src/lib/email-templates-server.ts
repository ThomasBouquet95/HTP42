import {
  getEmailTemplateDef,
  renderEmail,
  parseAddressList,
  type EmailVars,
} from "./email-templates";
import { getEmailTemplateOverride } from "./airtable";
import { env } from "./env";

export type ResolvedEmail = {
  // The catalog display name — used as the label in the email send log.
  name: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  // Effective sender + recipients after applying any admin override. For
  // dynamic-recipient emails `to` is empty here — the caller supplies the
  // per-record recipient and uses `cc`/`from` from this result.
  to: string[];
  cc: string[];
  from: string;
};

// Server-side bridge: given a template key + runtime vars, load any admin
// override from Airtable and render the ready-to-send subject, bodies,
// recipients and sender. Falls back to the coded defaults / env when no
// override is saved.
export async function resolveEmail(key: string, vars: EmailVars): Promise<ResolvedEmail> {
  const def = getEmailTemplateDef(key);
  if (!def) throw new Error(`Unknown email template: ${key}`);
  let override: Awaited<ReturnType<typeof getEmailTemplateOverride>> = null;
  try {
    override = await getEmailTemplateOverride(key);
  } catch {
    override = null;
  }
  const rendered = renderEmail(def, override, vars);

  const from = override?.from?.trim() || env.invoiceSender || env.invoiceRecipient;
  const cc = override?.cc?.trim() ? parseAddressList(override.cc) : def.defaultCc;
  let to: string[] = [];
  if (def.toMode === "fixed") {
    to = override?.to?.trim()
      ? parseAddressList(override.to)
      : def.defaultTo && def.defaultTo.length
        ? def.defaultTo
        : [env.invoiceRecipient];
  } else {
    // Dynamic recipient: the caller sets `to`. An override To can still force a
    // fixed address if an admin really wants to redirect it.
    to = override?.to?.trim() ? parseAddressList(override.to) : [];
  }

  return { name: def.name, ...rendered, to, cc, from };
}
