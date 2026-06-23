export async function reportError(route, error) {
  if (!process.env.SLACK_ERROR_WEBHOOK_URL) return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "No stack trace") : "No stack trace";

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🔴 Error in /${route}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Message:* ${message}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`${stack}\`\`\`` },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `*Env:* ${process.env.NODE_ENV ?? "unknown"} | *Time:* ${new Date().toUTCString()}`,
          },
        ],
      },
    ],
  };

  try {
    await fetch(process.env.SLACK_ERROR_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // never surface webhook failures to callers
  }
}
