/**
 * mail.ts — operator email (password reset). Not the agent write path.
 *
 * CENTRICMEM_MAIL_DUMP writes the message for tests.
 * CENTRICMEM_RESEND_API_KEY + CENTRICMEM_MAIL_FROM send via Resend.
 */
import fs from "node:fs";
import path from "node:path";
export class MailError extends Error {
    code;
    http;
    constructor(code, message, http = 503) {
        super(message);
        this.code = code;
        this.http = http;
        this.name = "MailError";
    }
}
export function mailConfigured() {
    if (process.env.CENTRICMEM_MAIL_DUMP?.trim())
        return true;
    return Boolean(process.env.CENTRICMEM_RESEND_API_KEY?.trim() && process.env.CENTRICMEM_MAIL_FROM?.trim());
}
export async function sendMail(message) {
    const dump = process.env.CENTRICMEM_MAIL_DUMP?.trim();
    if (dump) {
        const file = path.resolve(dump);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
        return;
    }
    const key = process.env.CENTRICMEM_RESEND_API_KEY?.trim();
    const from = process.env.CENTRICMEM_MAIL_FROM?.trim();
    if (!key || !from) {
        throw new MailError("MAIL_UNAVAILABLE", "Password reset email is not configured.", 503);
    }
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
        }),
    });
    if (!res.ok) {
        throw new MailError("MAIL_FAILED", "Could not send the reset email. Try again in a minute.", 503);
    }
}
