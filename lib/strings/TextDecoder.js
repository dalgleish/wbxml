var ByteInputStream = require('./ByteInputStream');
var CodePointOutputStream = require('./CodePointOutputStream');
var getEncoding = require('./encoding').getEncoding;
var eof = require('./eof');

var EOF_byte = eof.byte;
var EOF_code_point = eof.code_point;

/**
 * @constructor
 * @param {string=} opt_encoding The label of the encoding;
 *     defaults to 'utf-8'.
 * @param {{fatal: boolean}=} options
 */
function TextDecoder(opt_encoding, options) {
  if (!(this instanceof TextDecoder)) {
    throw new TypeError('Constructor cannot be called as a function');
  }
  opt_encoding = opt_encoding ? String(opt_encoding) : DEFAULT_ENCODING;
  options = Object(options);
  /** @private */
  this._encoding = getEncoding(opt_encoding);
  if (this._encoding === null)
    throw new TypeError('Unknown encoding: ' + opt_encoding);

  /** @private @type {boolean} */
  this._streaming = false;
  /** @private */
  this._decoder = null;
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

// TODO: Issue if input byte stream is offset by decoder
// TODO: BOM detection will not work if stream header spans multiple calls
// (last N bytes of previous stream may need to be retained?)
TextDecoder.prototype = {
  /**
   * @param {ArrayBufferView=} opt_view The buffer of bytes to decode.
   * @param {{stream: boolean}=} options
   */
  decode: function decode(opt_view, options) {
    if (opt_view && !('buffer' in opt_view && 'byteOffset' in opt_view &&
      'byteLength' in opt_view)) {
      throw new TypeError('Expected ArrayBufferView');
    } else if (!opt_view) {
      opt_view = new Uint8Array(0);
    }
    options = Object(options);

    if (!this._streaming) {
      this._decoder = this._encoding.getDecoder(this._options);
      this._BOMseen = false;
    }
    this._streaming = Boolean(options.stream);

    var bytes = new Uint8Array(opt_view.buffer,
      opt_view.byteOffset,
      opt_view.byteLength);
    var input_stream = new ByteInputStream(bytes);

    var output_stream = new CodePointOutputStream(), code_point;
    while (input_stream.get() !== EOF_byte) {
      code_point = this._decoder.decode(input_stream);
      if (code_point !== null && code_point !== EOF_code_point) {
        output_stream.emit(code_point);
      }
    }
    if (!this._streaming) {
      do {
        code_point = this._decoder.decode(input_stream);
        if (code_point !== null && code_point !== EOF_code_point) {
          output_stream.emit(code_point);
        }
      } while (code_point !== EOF_code_point &&
        input_stream.get() != EOF_byte);
      this._decoder = null;
    }

    var result = output_stream.string();
    if (!this._BOMseen && result.length) {
      this._BOMseen = true;
      if (['utf-8', 'utf-16le', 'utf-16be'].indexOf(this.encoding) !== -1 &&
        result.charCodeAt(0) === 0xFEFF) {
        result = result.substring(1);
      }
    }

    return result;
  }
};

/**
 * @param {string} label The encoding label.
 * @param {ByteInputStream} input_stream The byte stream to test.
 */
function consumeBOM(label, input_stream) {
  if (input_stream.match([0xFF, 0xFE]) && label === 'utf-16') {
    input_stream.offset(2);
    return;
  }
  if (input_stream.match([0xFE, 0xFF]) && label == 'utf-16be') {
    input_stream.offset(2);
    return;
  }
  if (input_stream.match([0xEF, 0xBB, 0xBF]) && label == 'utf-8') {
    input_stream.offset(3);
    return;
  }
}

module.exports = TextDecoder;
