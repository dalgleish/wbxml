var inRange = require('./inRange');
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

var decoderError = require('./error').decoderError;

/**
 * @constructor
 * @param {{fatal: boolean}} options
 */
function UTF8Decoder(options) {
  var fatal = options.fatal;
  var /** @type {number} */ utf8_code_point = 0,
    /** @type {number} */ utf8_bytes_needed = 0,
    /** @type {number} */ utf8_bytes_seen = 0,
    /** @type {number} */ utf8_lower_boundary = 0;

  /**
   * @param {ByteInputStream} byte_pointer The byte stream to decode.
   * @return {?number} The next code point decoded, or null if not enough
   *     data exists in the input stream to decode a complete code point.
   */
  this.decode = function(byte_pointer) {
    var bite = byte_pointer.get();
    if (bite === EOF_byte) {
      if (utf8_bytes_needed !== 0) {
        return decoderError(fatal);
      }
      return EOF_code_point;
    }
    byte_pointer.offset(1);

    if (utf8_bytes_needed === 0) {
      if (inRange(bite, 0x00, 0x7F)) {
        return bite;
      }
      if (inRange(bite, 0xC2, 0xDF)) {
        utf8_bytes_needed = 1;
        utf8_lower_boundary = 0x80;
        utf8_code_point = bite - 0xC0;
      } else if (inRange(bite, 0xE0, 0xEF)) {
        utf8_bytes_needed = 2;
        utf8_lower_boundary = 0x800;
        utf8_code_point = bite - 0xE0;
      } else if (inRange(bite, 0xF0, 0xF4)) {
        utf8_bytes_needed = 3;
        utf8_lower_boundary = 0x10000;
        utf8_code_point = bite - 0xF0;
      } else {
        return decoderError(fatal);
      }
      utf8_code_point = utf8_code_point * Math.pow(64, utf8_bytes_needed);
      return null;
    }
    if (!inRange(bite, 0x80, 0xBF)) {
      utf8_code_point = 0;
      utf8_bytes_needed = 0;
      utf8_bytes_seen = 0;
      utf8_lower_boundary = 0;
      byte_pointer.offset(-1);
      return decoderError(fatal);
    }
    utf8_bytes_seen += 1;
    utf8_code_point = utf8_code_point + (bite - 0x80) *
      Math.pow(64, utf8_bytes_needed - utf8_bytes_seen);
    if (utf8_bytes_seen !== utf8_bytes_needed) {
      return null;
    }
    var code_point = utf8_code_point;
    var lower_boundary = utf8_lower_boundary;
    utf8_code_point = 0;
    utf8_bytes_needed = 0;
    utf8_bytes_seen = 0;
    utf8_lower_boundary = 0;
    if (inRange(code_point, lower_boundary, 0x10FFFF) &&
      !inRange(code_point, 0xD800, 0xDFFF)) {
      return code_point;
    }
    return decoderError(fatal);
  };
}

module.exports = UTF8Decoder;

