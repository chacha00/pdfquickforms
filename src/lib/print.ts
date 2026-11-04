/**
 * Print a PDF Blob using the browser's built-in PDF viewer in a hidden
 * same-origin iframe. Nothing leaves the device. Returns false if the
 * browser can't print this way (caller should offer download instead).
 */
export function printPdfBlob(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Print preview";
    // Off-screen rather than display:none — some browsers refuse to print hidden frames.
    Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "1px", height: "1px", border: "0", opacity: "0" });
    let done = false;
    const cleanup = () => setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
    frame.onload = () => {
      // Give the PDF viewer a moment to initialise before printing.
      setTimeout(() => {
        if (done) return;
        done = true;
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve(true);
        } catch {
          resolve(false);
        }
        cleanup();
      }, 400);
    };
    frame.src = url;
    document.body.appendChild(frame);
    setTimeout(() => {
      if (done) return;
      done = true;
      resolve(false);
      cleanup();
    }, 10_000);
  });
}
