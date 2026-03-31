type BuildMagicLinkEmailParams = {
	url: string;
	host: string;
	email: string;
};

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function buildMagicLinkEmail({ url, host, email }: BuildMagicLinkEmailParams): { html: string; text: string } {
	const safeUrl = escapeHtml(url);
	const safeHost = escapeHtml(host);
	const safeEmail = escapeHtml(email);
	const year = new Date().getFullYear();

  const logoUrl = `https://${safeHost}/StackNote.png`;
  const logoMarkup = `<a href="https://${safeHost}" target="_blank">
  <img src="${logoUrl}" alt="StackNote" width="52" height="52" style="display: block; width: 52px; height: 52px; margin: 0 auto 12px; border: 0;" /></a>`;

	const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sign in to StackNote</title>
  </head>
  <body style="margin: 0; background-color: #000000; background-image: radial-gradient(ellipse 70% 50% at 15% 20%, rgba(124, 106, 255, 0.13) 0%, transparent 70%), radial-gradient(ellipse 60% 45% at 85% 80%, rgba(100, 80, 220, 0.10) 0%, transparent 65%); padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
      Sign in to StackNote on ${safeHost}. No password needed.
    </div>
    <div style="margin: 0 auto; max-width: 560px;">
      <div style="margin-bottom: 24px; text-align: center;">
        ${logoMarkup}
        <div style="margin: 0; font-size: 20px; font-weight: 700; color: #f0f0f0;">StackNote</div>
      </div>
      <div style="background-color: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 16px; padding: 36px 32px; box-shadow: 0 0 0 1px #1e1e1e, 0 -2px 24px rgba(124, 106, 255, 0.08);">
        <h1 style="margin: 0 0 8px; font-size: 20px; font-weight: 600; color: #f0f0f0;">Sign in to your account</h1>
        <p style="margin: 0 0 28px; font-size: 14px; line-height: 1.6; color: #888888;">Click the button below to sign in to StackNote. No password needed.</p>
        <a href="${safeUrl}" style="display: block; margin-bottom: 28px; border-radius: 10px; background-color: #7c6aff; padding: 14px 24px; text-align: center; text-decoration: none; letter-spacing: 0.01em; font-size: 15px; font-weight: 600; color: #ffffff;">Sign in to StackNote</a>
        <hr style="margin: 0 0 24px; border: none; border-top: 1px solid #1e1e1e;" />
        <div style="margin-bottom: 8px; font-size: 12px; color: #555555;">Or copy and paste this link into your browser:</div>
        <div style="border: 1px solid #2a2a2a; border-radius: 8px; background-color: #141414; padding: 10px 12px;">
          <div style="word-break: break-all; font-family: 'Courier New', monospace; font-size: 11px; color: #888888;">${safeUrl}</div>
        </div>
        <p style="margin: 20px 0 0; font-size: 12px; color: #e05c5c;">This sign-in link expires in 24 hours and can only be used once.</p>
      </div>
      <div style="margin-top: 24px; text-align: center;">
        <div style="font-size: 12px; color: #555555;">If you didn&#39;t request this email, you can safely ignore it.</div>
        <div style="margin-top: 8px; font-size: 11px; color: #3a3a3a;">&copy; ${year} StackNote &middot; Sent to ${safeEmail}</div>
      </div>
    </div>
  </body>
</html>`;

	const text = `Sign in to StackNote
--------------------

Click the link below to sign in. No password needed.

${url}

This link expires in 24 hours and can only be used once.

If you didn't request this, ignore this email.`;

	return { html, text };
}
