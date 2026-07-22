// Content sniffing for uploads. The multipart `Content-Type` and the filename
// extension are both client-controlled, so we additionally verify the leading
// "magic bytes" match the claimed kind before storing a file. Reads only the
// first few bytes of an already-buffered upload — negligible cost.

export function hasPdfSignature(buf: Buffer | Uint8Array): boolean {
  // "%PDF-" (optionally after a small BOM/whitespace preamble some tools add).
  const head = Buffer.from(buf.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}

export function hasWordSignature(buf: Buffer | Uint8Array): boolean {
  const b = Buffer.from(buf.subarray(0, 8));
  // .docx is a ZIP container ("PK\x03\x04"); legacy .doc is OLE2
  // ("D0 CF 11 E0 A1 B1 1A E1").
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return true;
  if (
    b.length >= 8 &&
    b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 &&
    b[4] === 0xa1 && b[5] === 0xb1 && b[6] === 0x1a && b[7] === 0xe1
  ) {
    return true;
  }
  return false;
}

export function hasImageSignature(buf: Buffer | Uint8Array): boolean {
  const b = Buffer.from(buf.subarray(0, 16));
  // PNG
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // JPEG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // GIF ("GIF8")
  if (b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true;
  // WEBP ("RIFF"...."WEBP")
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return true;
  }
  return false;
}
