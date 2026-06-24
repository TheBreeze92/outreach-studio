export function buildMailtoUrl({ prospectEmail, subject, parts, greeting, senderName }) {
  const strippedParts = parts.map(p =>
    p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  );

  const body = [greeting, ...strippedParts, `Best,\n${senderName}`].join("\n\n");

  const to = prospectEmail.trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildGmailUrl({ prospectEmail, subject, parts, greeting, senderName }) {
  const strippedParts = parts.map(p =>
    p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
  );

  const body = [greeting, ...strippedParts, `Best,\n${senderName}`].join("\n\n");
  const to = prospectEmail?.trim() ?? "";

  let url = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (to) url += `&to=${encodeURIComponent(to)}`;
  return url;
}
