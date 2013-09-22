
var ByteOutputStream = require('./ByteOutputStream');
var CodePointInputStream = require('./CodePointInputStream');
var getEncoding = require('./encoding').getEncoding;
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

//
// Implementation of Text Encoding Web API
//

/** @const */ var DEFAULT_ENCODING = 'utf-8';

/**
 * @constructor
 * @param {string=} opt_encoding The label of the encoding;
 *     defaults to 'utf-8'.
 * @param {{fatal: boolean}=} options
 */
function TextEncoder(opt_encoding, options) {
  if (!(this instanceof TextEncoder)) {
    throw new TypeError('Constructor cannot be called as a function');
  }
  opt_encoding = opt_encoding ? String(opt_encoding) : DEFAULT_ENCODING;
  options = Object(options);
  /** @private */
  this._encoding = getEncoding(opt_encoding);
  if (this._encoding === null || (this._encoding.name !== 'utf-8' &&
    this._encoding.name !== 'utf-16le' &&
    this._encoding.name !== 'utf-16be'))
    throw new TypeError('Unknown encoding: ' + opt_encoding);
  /** @private @type {boolean} */
  this._streaming = false;
  /** @private */
  this._encoder = null;
  /** @private @type {{fatal: boolean}=} */
  this._options = { fatal: Boolean(options.fatal) };

  if (Object.defineProperty) {
    Object.defineProperty(
      this, 'encoding',
      { get: function() { return this._encoding.name; } });
  } else {
    this.encoding = this._encoding.name;
  }

  return this;
}

TextEncoder.prototype = {
  /**
   * @param {string=} opt_string The string to encode.
   * @param {{stream: boolean}=} options
   */
  encode: function encode(opt_string, options) {
    opt_string = opt_string ? String(opt_string) : '';
    options = Object(options);
    // TODO: any options?
    if (!this._streaming) {
      this._encoder = this._encoding.getEncoder(this._options);
    }
    this._streaming = Boolean(options.stream);

    var bytes = [];
    var output_stream = new ByteOutputStream(bytes);
    var input_stream = new CodePointInputStream(opt_string);
    while (input_stream.get() !== EOF_code_point) {
      this._encoder.encode(output_stream, input_stream);
    }
    if (!this._streaming) {
      var last_byte;
      do {
        last_byte = this._encoder.encode(output_stream, input_stream);
      } while (last_byte !== EOF_byte);
      this._encoder = null;
    }
    return bytes;
  }
};

module.exports = TextEncoder;
