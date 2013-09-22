var EOF_byte = require('./eof').byte;

/**
 * @constructor
 * @param {Uint8Array} bytes Array of bytes that provide the stream.
 */
function ByteInputStream(bytes) {
  /** @type {number} */
  var pos = 0;

  /** @return {number} Get the next byte from the stream. */
  this.get = function() {
    return (pos >= bytes.length) ? EOF_byte : Number(bytes[pos]);
  };

  /** @param {number} n Number (positive or negative) by which to
   *      offset the byte pointer. */
  this.offset = function(n) {
    pos += n;
    if (pos < 0) {
      throw new Error('Seeking past start of the buffer');
    }
    if (pos > bytes.length) {
      throw new Error('Seeking past EOF');
    }
  };
}

module.exports = ByteInputStream;

