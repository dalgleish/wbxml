"use strict";

var util = require('util'),
    stream = require('stream'),
    TextDecoder = require('./strings').TextDecoder,
    codes = require('./codes');

// For Node 0.8 users
if (!stream.Transform) {
  stream = require('readable-stream');
}

var globalCodes = require('./codes').global;
var unsupported = [0x02, 0x04, 0x40, 0x41, 0x42, 0x43, 0x44, 0x80, 0x81, 0x82, 0x83, 0x84, 0xC0, 0xC1, 0xC2, 0xC3, 0xC4];

var debug;
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    console.error('WBXML %s', util.format.apply(util, arguments));
  };
} else {
  debug = function() {};
}

function binify(src) {
  var dest = new Uint8Array(src.length);
  for (var i = 0, l = src.length; i < l; i++) {
    dest[i] = src[i];
  }
  return dest;
}

module.exports = function (opts, cb) {
  var decoder = new Decoder(opts, cb);
  if (typeof cb === 'function') {
    decoder.on('error', cb);
  }
  return decoder;
};

module.exports.Decoder = Decoder;

function Decoder (opts, cb) {
  opts = opts || {};
  // Decoder is always in object mode
  opts.objectMode = true;

  stream.Transform.call(this, opts);

  // assign callback
  this.cb = null;
  if (cb) {
    this.cb = cb;
  }
  if (typeof opts === 'function') {
    this.cb = opts;
  }

  this._codePages = opts.codepages;

  // State
  this._currentPage = 0;
  this._switchPage = false;
  this._inlineString = false;
  this._stringBuffer = [];
  this._header = { complete: false };
  this._mb_uint32_buffer = 0;
  this._names = [];
  this._values = [[]];
}
util.inherits(Decoder, stream.Transform);

/* Header - First 4 bytes
 *
 * version   <- WBXML version number
 *              Contains the major version minus one
 *              in the upper four bits / minor version in the lower
 *              We should fail its < 0x01 or > 0x03
 * publicid  <- Document Public Identifier
 *              (Usually this is 0x01 for 'unknown')
 * charset   <- multi-byte positive integer value representing the
 *              IANA-assigned  MIB number for a character set
 *              (utf-8 assumed)
 * strtbl    <- String Table
 *              (not used for activesync so this should always be 0x00)
 */

Decoder.prototype._transform = function (chunk, encoding, done) {
  try {
    this._parse(chunk);
    done();
  } catch (err) {
    done(err);
  }
};

Decoder.prototype._parse = function (chunk) {
  // TODO: Support attributes
  var i = 0, length = chunk.length, token, more, attributes,
    str, obj, name, value, tag, that = this;

  if (length === 0) {
    return;
  }

  this.emit('raw', chunk);

  function _get_mb_uint32() {
    var b = chunk[i];
    that._mb_uint32_buffer = that._mb_uint32_buffer*128 + (b & 0x7f);

    if (b & 0x80) { return false; }
    else { return true; }
  }

  for(; i < length; i++) {

    // Read Header //
    if (!this._header.complete){
      if (!this._header.version) {
        this._header.version =  chunk[i];
        continue;
      }
      if (!this._header.publicid) {
        if (_get_mb_uint32()) {
          this._header.publicid = this._mb_uint32_buffer;
          this._mb_uint32_buffer = 0;
        }
        continue;
      }
      if (!this._header.charset) {
        if (_get_mb_uint32()) {
          this._header.charset = codes.mib2str[this._mb_uint32_buffer] || 'unknown';
          this._decoder = new TextDecoder(this._header.charset);
          this._mb_uint32_buffer = 0;
        }

        continue;
      }
      // TODO: Support stringtables
      if (!this._header.strtbl) {
        if (_get_mb_uint32()) {
          this._header.strtbl = this._mb_uint32_buffer;
          this._mb_uint32_buffer = 0;
          this._header.complete = true;
        }

        continue;
      }
    }

    // Read Inline String //
    if (this._inlineString) {
      for (; i < length; i++) {
        // look for termstr (0x00)
        if (chunk[i] === 0) {
          str = this._decoder.decode(binify(this._stringBuffer));
          debug(str);
          this._values.push(str);
          break;
        }

        this._stringBuffer.push(chunk[i]);
      }

      if (i < length) {
        this._stringBuffer = [];
        this._inlineString = false;
      }
      continue;
    }

    // Read New Element //
    if (this._switchPage) {
      if (chunk[i] < 0 || chunk[i] >= this._codePages.length) {
        throw new Error('Unknown code page ID '+ this._currentPage.toString(16) + ' encountered in WBXML');
      }
      this._currentPage = chunk[i];

      debug('PAGE ', chunk[i]);
      this._switchPage = false;
      continue;
    }
    // Begin Inline String //
    if (chunk[i] === globalCodes.STR_I) {
      debug('STR_I');
      // Need to remove the extra [] pushed on there
      this._values.pop();
      this._inlineString = true;
      continue;
    }
    // Switch Page //
    if (chunk[i] === globalCodes.SWITCH_PAGE) {
      debug('SWITCH_PAGE');
      this._switchPage = true;
      continue;
    }
    // End Element //
    if (chunk[i] === globalCodes.END) {
      debug('END');
      value = this._values.pop();
      name = this._names.pop();
      obj = {};
      obj[name] = value;
      this._values[this._values.length-1].push(obj);
      continue;
    }
    // TODO: Support other global codes
    if (unsupported.indexOf(chunk[i]) !== -1) {
      throw new Error('Encountered unknown global token: '+ chunk[i]);
    }
    // Begin tag //
    more       = (chunk[i] & 0x40);
    token      = (chunk[i] & 0x3F);
    attributes = (chunk[i] & 0x80);
    tag = this._codePages[this._currentPage][token];

    if (attributes) {
      throw new Error('Attributes are not supported');
    }

    if (!tag) {
      throw new Error('Could not resolve element\'s name. Token: \'' + tag);
    }

    // Special case for empty elements
    if (more === 0) {
      obj = {};
      obj[name] = value;
      this._values[this._values.length-1].push(obj);
    } else {
      this._names.push(tag);
      this._values.push([]);
    }
  }

  if (!this.cb) {
    this.push(this._values.pop()[0]);
  }
};

Decoder.prototype.end = function (buf, encoding) {
  var self = this;
  stream.Transform.prototype.end.call(this, buf, encoding, function () {
    if (self.cb) {
      self.cb(null, self._values.pop()[0]);
    }
  });
};