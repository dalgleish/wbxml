// A growable byte buffer for the encoder.
export class ByteWriter {
  constructor(size = 256) {
    this.buf = new Uint8Array(size);
    this.length = 0;
  }

  reserve(extra) {
    const need = this.length + extra;
    if (need <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < need) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }

  byte(b) {
    this.reserve(1);
    this.buf[this.length] = b;
    this.length += 1;
  }

  bytes(source) {
    this.reserve(source.length);
    this.buf.set(source, this.length);
    this.length += source.length;
  }

  /** Minimal mb_u_int32 of a non-negative integer up to 0xFFFFFFFF. */
  mbUInt32(value) {
    const groups = [value % 128];
    for (let rest = Math.floor(value / 128); rest > 0; rest = Math.floor(rest / 128)) {
      groups.push(rest % 128);
    }
    for (let i = groups.length - 1; i > 0; i -= 1) this.byte(groups[i] | 0x80);
    this.byte(groups[0]);
  }

  finish() {
    return this.buf.slice(0, this.length);
  }
}
