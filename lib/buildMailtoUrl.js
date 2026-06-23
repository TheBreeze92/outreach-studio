export function buildMailtoUrl({ prospectEmail, subject, parts, greeting, senderName }) {
  const strippedParts = parts.map(p =>
    p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  );

  const body = [greeting, ...strippedParts, `Best,\n${senderName}`].join("\n\n");

  const to = prospectEmail.trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
