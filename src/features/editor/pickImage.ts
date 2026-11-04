import { detectKind } from "../../lib/validation/fileSignature";
import { LIMITS } from "../../lib/limits";
import { formatBytes } from "../../lib/format";
import type { ProjectImage } from "../../lib/forms/model";

/** Let the user pick a PNG/JPG from their device (read locally, validated by signature). */
export function pickImage(): Promise<ProjectImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,.png,.jpg,.jpeg";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      if (file.size > LIMITS.image.maxFileBytes) return reject(new Error(`Images can be up to ${formatBytes(LIMITS.image.maxFileBytes)}.`));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const kind = detectKind(bytes.subarray(0, 16));
      if (kind !== "png" && kind !== "jpeg") return reject(new Error("Choose a PNG or JPG image."));
      try {
        const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
        resolve({ kind, bytes, width: bmp.width, height: bmp.height });
        bmp.close();
      } catch {
        reject(new Error("This image couldn't be read."));
      }
    };
    input.click();
  });
}
