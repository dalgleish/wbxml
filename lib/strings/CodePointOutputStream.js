
/**
 * @constructor
 */
function CodePointOutputStream() {
  /** @type {string} */
  var string = '';

  /** @return {string} The accumulated string. */
  this.string = function() {
    return string;
  };

  /** @param {number} c The code point to encode into the stream. */
  this.emit = function(c) {
    if (c <= 0xFFFF) {
      string += String.fromCharCode(c);
    } else {
      c -= 0x10000;
      string += String.fromCharCode(0xD800 + ((c >> 10) & 0x3ff));
      string += String.fromCharCode(0xDC00 + (c & 0x3ff));
    }
  };
}

module.exports = CodePointOutputStream;

