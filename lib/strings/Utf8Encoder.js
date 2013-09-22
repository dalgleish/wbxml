
var encoding = require('./encoding');
var inRange = require('./inRange');
var div = require('./div');
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

/**
 * @constructor
 * @param {{fatal: boolean}} options
 */
function UTF8Encoder(options) {
  var fatal = options.fatal;
  /**
   * @param {ByteOutputStream} output_byte_stream Output byte stream.
   * @param {CodePointInputStream} code_point_pointer Input stream.
   * @return {number} The last byte emitted.
   */
  this.encode = function(output_byte_stream, code_point_pointer) {
    var code_point = code_point_pointer.get();
    if (code_point === EOF_code_point) {
      return EOF_byte;
    }
    code_point_pointer.offset(1);
    if (inRange(code_point, 0xD800, 0xDFFF)) {
      return encoderError(code_point);
    }
    if (inRange(code_point, 0x0000, 0x007f)) {
      return output_byte_stream.emit(code_point);
    }
    var count, offset;
    if (inRange(code_point, 0x0080, 0x07FF)) {
      count = 1;
      offset = 0xC0;
    } else if (inRange(code_point, 0x0800, 0xFFFF)) {
      count = 2;
      offset = 0xE0;
    } else if (inRange(code_point, 0x10000, 0x10FFFF)) {
      count = 3;
      offset = 0xF0;
    }
    var result = output_byte_stream.emit(
      div(code_point, Math.pow(64, count)) + offset);
    while (count > 0) {
      var temp = div(code_point, Math.pow(64, count - 1));
      result = output_byte_stream.emit(0x80 + (temp % 64));
      count -= 1;
    }
    return result;
  };
}

module.exports = UTF8Encoder;
