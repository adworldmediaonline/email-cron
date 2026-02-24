export interface RecipientData {
  recipientEmail: string
  recipientName?: string | null
}

export function personalizeContent(
  content: string,
  recipient: RecipientData
): string {
  const firstName =
    recipient.recipientName?.split(/\s+/)[0]?.trim() || "there"
  const name = recipient.recipientName || ""
  const email = recipient.recipientEmail || ""

  return content
    .replace(/\{\{firstName\}\}/gi, firstName)
    .replace(/\{\{first_name\}\}/gi, firstName)
    .replace(/\{\{name\}\}/gi, name)
    .replace(/\{\{email\}\}/gi, email)
}
