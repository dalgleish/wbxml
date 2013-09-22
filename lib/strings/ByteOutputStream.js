var EOF_byte = require('./eof').byte;

/**
 * @constructor
 * @param {Array.<number>} bytes The array to write bytes into.
 */
function ByteOutputStream(bytes) {
  /** @type {number} */
  var pos = 0;

  /**
   * @param {...number} var_args The byte or bytes to emit into the stream.
   * @return {number} The last byte emitted.
   */
  this.emit = function(var_args) {
    /** @type {number} */
    var last = EOF_byte;
    var i;
    for (i = 0; i < arguments.length; ++i) {
      last = Number(arguments[i]);
      bytes[pos++] = last;
    }
    return last;
  };
}

module.exports = ByteOutputStream;

