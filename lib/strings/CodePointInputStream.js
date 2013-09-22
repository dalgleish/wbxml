var inRange = require('./inRange');

var EOF_code_point = require('./eof').code_point;

/**
 * @constructor
 * @param {string} string The source of code units for the stream.
 */
function CodePointInputStream(string) {
  /**
   * @param {string} string Input string of UTF-16 code units.
   * @return {Array.<number>} Code points.
   */
  function stringToCodePoints(string) {
    /** @type {Array.<number>} */
    var cps = [];
    // Based on http://www.w3.org/TR/WebIDL/#idl-DOMString
    var i = 0, n = string.length;
    while (i < string.length) {
      var c = string.charCodeAt(i);
      if (!inRange(c, 0xD800, 0xDFFF)) {
        cps.push(c);
      } else if (inRange(c, 0xDC00, 0xDFFF)) {
        cps.push(0xFFFD);
      } else { // (inRange(cu, 0xD800, 0xDBFF))
        if (i === n - 1) {
          cps.push(0xFFFD);
        } else {
          var d = string.charCodeAt(i + 1);
          if (inRange(d, 0xDC00, 0xDFFF)) {
            var a = c & 0x3FF;
            var b = d & 0x3FF;
            i += 1;
            cps.push(0x10000 + (a << 10) + b);
          } else {
            cps.push(0xFFFD);
          }
        }
      }
      i += 1;
    }
    return cps;
  }

  /** @type {number} */
  var pos = 0;
  /** @type {Array.<number>} */
  var cps = stringToCodePoints(string);

  /** @param {number} n The number of bytes (positive or negative)
   *      to advance the code point pointer by.*/
  this.offset = function(n) {
    pos += n;
    if (pos < 0) {
      throw new Error('Seeking past start of the buffer');
    }
    if (pos > cps.length) {
      throw new Error('Seeking past EOF');
    }
  };


  /** @return {number} Get the next code point from the stream. */
  this.get = function() {
    if (pos >= cps.length) {
      return EOF_code_point;
    }
    return cps[pos];
  };
}

module.exports = CodePointInputStream;

