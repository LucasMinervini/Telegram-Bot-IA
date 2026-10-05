/**
 * FileSignatureDetector.ts
 * Detects file types by magic bytes (never trusts file names)
 * Single Responsibility: map binary signatures to candidate extensions
 */

interface IFileSignature {
  extensions: string[];
  bytes: number[];
}

const SIGNATURES: ReadonlyArray<IFileSignature> = [
  { extensions: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { extensions: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { extensions: ['.gif'], bytes: [0x47, 0x49, 0x46, 0x38] },
  { extensions: ['.webp'], bytes: [0x52, 0x49, 0x46, 0x46] },
  { extensions: ['.bmp'], bytes: [0x42, 0x4d] },
  { extensions: ['.tiff'], bytes: [0x49, 0x49, 0x2a, 0x00] },
  { extensions: ['.tiff'], bytes: [0x4d, 0x4d, 0x00, 0x2a] },
  { extensions: ['.pdf'], bytes: [0x25, 0x50, 0x44, 0x46] },
  // ZIP container: also used by Office Open XML formats
  { extensions: ['.zip', '.docx', '.xlsx', '.pptx'], bytes: [0x50, 0x4b, 0x03, 0x04] },
  { extensions: ['.doc', '.xls', '.ppt'], bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

export class FileSignatureDetector {
  /**
   * Return every extension (with leading dot) whose signature matches the buffer.
   * Empty array when the content is not recognized.
   */
  detect(buffer: Buffer): string[] {
    if (!buffer || buffer.length < 2) return [];

    const candidates = new Set<string>();
    for (const signature of SIGNATURES) {
      if (this.matches(buffer, signature.bytes)) {
        signature.extensions.forEach((ext) => candidates.add(ext));
      }
    }
    return [...candidates];
  }

  private matches(buffer: Buffer, bytes: number[]): boolean {
    if (buffer.length < bytes.length) return false;
    return bytes.every((byte, i) => buffer[i] === byte);
  }
}
