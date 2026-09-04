/**
 * guest.ts — this machine talks to a remote librarian (not a leftover hub).
 * Loopback CENTRICMEM_URL is the librarian host itself, not a guest.
 */
import { loadCatalog } from "./libraries.js";
export function librarianGuestOrigin() {
    const raw = (process.env.CENTRICMEM_URL?.trim() || loadCatalog()?.origin?.trim() || "").replace(/\/+$/, "");
    if (!raw || !/^https?:\/\//i.test(raw))
        return null;
    try {
        const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
        const host = u.hostname.toLowerCase();
        if (host === "127.0.0.1" || host === "localhost" || host === "::1")
            return null;
        const basePath = u.pathname.replace(/\/+$/, "");
        const path = basePath && basePath !== "/" ? basePath : "";
        return `${u.protocol}//${u.host}${path}`;
    }
    catch {
        return null;
    }
}
export function isLibrarianGuest() {
    return librarianGuestOrigin() !== null;
}
export function guestHubWriteMessage(action) {
    const origin = librarianGuestOrigin() || "the remote librarian";
    return `Guest of ${origin}: ${action} cannot write the leftover hub (CENTRICMEM_HOME). Use librarian HTTP. Operators write on the librarian host.`;
}
