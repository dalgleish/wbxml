var inRange = require('./inRange');
var div = require('./div');
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

/**
 * @constructor
 * @param {boolean} utf16_be True if big-endian, false if little-endian.
 * @param {{fatal: boolean}} options
 */
function UTF16Encoder(utf16_be, options) {
  var fatal = options.fatal;
  /**
   * @param {ByteOutputStream} output_byte_stream Output byte stream.
   * @param {CodePointInputStream} code_point_pointer Input stream.
   * @return {number} The last byte emitted.
   */
  this.encode = function(output_byte_stream, code_point_pointer) {
    function convert_to_bytes(code_unit) {
      var byte1 = code_unit >> 8;
      var byte2 = code_unit & 0x00FF;
      if (utf16_be) {
        return output_byte_stream.emit(byte1, byte2);
      }
      return output_byte_stream.emit(byte2, byte1);
    }
    var code_point = code_point_pointer.get();
    if (code_point === EOF_code_point) {
      return EOF_byte;
    }
    code_point_pointer.offset(1);
    if (inRange(code_point, 0xD800, 0xDFFF)) {
      encoderError(code_point);
    }
    if (code_point <= 0xFFFF) {
      return convert_to_bytes(code_point);
    }
    var lead = div((code_point - 0x10000), 0x400) + 0xD800;
    var trail = ((code_point - 0x10000) % 0x400) + 0xDC00;
    convert_to_bytes(lead);
    return convert_to_bytes(trail);
  };
}

module.exports = UTF16Encoder;

