// Minimal ICO container writer: embeds PNG-compressed images (Vista+ format).
// Valid for 16-256px entries; Windows Explorer and Electron both read these.
export function pngToIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let total = headerSize;
  for (const b of pngBuffers) total += b.length;
  const out = Buffer.alloc(total);
  let off = 0;

  // ICONDIR
  out.writeUInt16LE(0, off); off += 2; // reserved
  out.writeUInt16LE(1, off); off += 2; // type: icon
  out.writeUInt16LE(count, off); off += 2;

  // ICONDIRENTRY headers (all offsets relative to file start)
  let dataOffset = headerSize;
  for (const b of pngBuffers) {
    // width/height: 0 means 256
    const dirSize = 16;
    out[off] = b.length >= 1 ? readPngSize(b) : 0; // placeholder, fixed below
    off += dirSize;
    dataOffset += 0;
  }
  // The loop above needs the real sizes; redo properly:
  off = 6;
  dataOffset = headerSize;
  for (const b of pngBuffers) {
    const size = readPngSize(b);
    out[off++] = size === 256 ? 0 : size; // width
    out[off++] = size === 256 ? 0 : size; // height
    out[off++] = 0; // palette
    out[off++] = 0; // reserved
    out.writeUInt16LE(1, off); off += 2; // color planes
    out.writeUInt16LE(32, off); off += 2; // bits per pixel
    out.writeUInt32LE(b.length, off); off += 4;
    out.writeUInt32LE(dataOffset, off); off += 4;
    dataOffset += b.length;
  }

  // Image data
  let p = headerSize;
  for (const b of pngBuffers) {
    b.copy(out, p);
    p += b.length;
  }
  return out;
}

function readPngSize(png) {
  // PNG IHDR: bytes 16-19 width, 20-23 height (big-endian)
  return png.readUInt32BE(16);
}
