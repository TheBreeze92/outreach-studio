const ROUTE_LABELS = {
  research: {
    plain: "Email generation feature",
    impact: "A user may have seen an error while trying to generate an email.",
  },
  subscribe: {
    plain: "Email signup form",
    impact: "A user may have seen an error while trying to sign up.",
  },
};

export async function reportError(route, error) {
  if (!process.env.SLACK_ERROR_WEBHOOK_URL) return;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? "No stack trace") : "No stack trace";
  const label = ROUTE_LABELS[route] ?? { plain: route, impact: "An unexpected error occurred." };
  const time = new Date().toUTCString();

  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔴 Cold Outreach Studio — Something broke" },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Feature:* ${label.plain}\n*Time:* ${time}\n\n${label.impact}`,
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Technical detail (for your developer)*\n*Error:* ${message}\n\`\`\`${stack}\`\`\``,
        },
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
