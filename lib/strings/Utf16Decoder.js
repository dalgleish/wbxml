var inRange = require('./inRange');
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

var decoderError = require('./error').decoderError;

/**
 * @constructor
 * @param {boolean} utf16_be True if big-endian, false if little-endian.
 * @param {{fatal: boolean}} options
 */
function UTF16Decoder(utf16_be, options) {
  var fatal = options.fatal;
  var /** @type {?number} */ utf16_lead_byte = null,
    /** @type {?number} */ utf16_lead_surrogate = null;
  /**
   * @param {ByteInputStream} byte_pointer The byte stream to decode.
   * @return {?number} The next code point decoded, or null if not enough
   *     data exists in the input stream to decode a complete code point.
   */
  this.decode = function(byte_pointer) {
    var bite = byte_pointer.get();
    if (bite === EOF_byte && utf16_lead_byte === null &&
      utf16_lead_surrogate === null) {
      return EOF_code_point;
    }
    if (bite === EOF_byte && (utf16_lead_byte !== null ||
      utf16_lead_surrogate !== null)) {
      return decoderError(fatal);
    }
    byte_pointer.offset(1);
    if (utf16_lead_byte === null) {
      utf16_lead_byte = bite;
      return null;
    }
    var code_point;
    if (utf16_be) {
      code_point = (utf16_lead_byte << 8) + bite;
    } else {
      code_point = (bite << 8) + utf16_lead_byte;
    }
    utf16_lead_byte = null;
    if (utf16_lead_surrogate !== null) {
      var lead_surrogate = utf16_lead_surrogate;
      utf16_lead_surrogate = null;
      if (inRange(code_point, 0xDC00, 0xDFFF)) {
        return 0x10000 + (lead_surrogate - 0xD800) * 0x400 +
          (code_point - 0xDC00);
      }
      byte_pointer.offset(-2);
      return decoderError(fatal);
    }
    if (inRange(code_point, 0xD800, 0xDBFF)) {
      utf16_lead_surrogate = code_point;
      return null;
    }
    if (inRange(code_point, 0xDC00, 0xDFFF)) {
      return decoderError(fatal);
    }
    return code_point;
  };
}

module.exports = UTF16Decoder;

