"use client";

const CLIPBOARD_WRITE_TIMEOUT_MS = 1500;

async function tryNavigatorClipboardWrite(text: string) {
    if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
        return false;
    }

    try {
        await Promise.race([
            navigator.clipboard.writeText(text),
            new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error("Clipboard write timed out.")), CLIPBOARD_WRITE_TIMEOUT_MS);
            }),
        ]);
        return true;
    } catch {
        return false;
    }
}

function tryLegacyClipboardCopy(text: string) {
    if (typeof document === "undefined") {
        return false;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";

    const selection = document.getSelection();
    const originalRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
        return document.execCommand("copy");
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
        if (selection) {
            selection.removeAllRanges();
            if (originalRange) {
                selection.addRange(originalRange);
            }
        }
    }
}

export async function copyTextToClipboard(text: string) {
    if (!text) {
        throw new Error("Unable to copy empty text.");
    }

    if (await tryNavigatorClipboardWrite(text)) {
        return;
    }

    if (tryLegacyClipboardCopy(text)) {
        return;
    }

    throw new Error("Unable to copy to clipboard.");
}
