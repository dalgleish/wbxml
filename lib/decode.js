var util = require('util'),
  Transform = require('readable-stream/transform'),
  global = require('./codes').global,
  StringDecoder = require('string_decoder').StringDecoder;

var decoder = new StringDecoder('utf8');

var debug
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    console.error('WBXML %s', util.format.apply(util, arguments))
  }
} else {
  debug = function() {}
}

function Decoder(options) {
  if (!(this instanceof Decoder))
    return new Decoder(options);

  Transform.call(this, options);

  this._codePages = options.codepages;
  this._currentPage = 0;
  this._switchPage = false;
  this._inlineString = false;
  this._headerComplete = false;
  this._stringBuffer = [];
  this._header = {};
  this._stack = [];
}
util.inherits(Decoder, Transform);

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

  var i = 0
    , length = chunk.length
    , token
    , more
    , name;

    if (length === 0) return done();

    this.emit('raw', chunk);

    for(; i < length; i++) {

      if (!this._headerComplete){
        if (!this._header.version) {
          this._header.version = chunk[i];
          continue;
        }
        if (!this._header.publicid) {
          this._header.publicid = chunk[i];
          continue;
        }

        if (!this._header.charset) {
          this._header.charset = chunk[i];
          continue;
        }

        if (!this._header.strtbl) {
          this._header.strtbl = chunk[i];
          this._headerComplete = true;
          continue;
        }
      }

      if (this._inlineString) {
        for (; i < length; i++) {
          // look for termstr (0x00)
          if (chunk[i] === 0) {
            var str = decoder.write(new Buffer(this._stringBuffer));
            debug(str);
            this._stack.push(str);
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
      if (this._switchPage) {
        this._currentPage = chunk[i];
        debug('PAGE ', chunk[i]);
        this._switchPage = false;  // Flag off
        continue;
      }
      if (chunk[i] === global.STR_I) {
        debug('STR_I');
        this._inlineString = true; // Flag on
        continue;
      }
      if (chunk[i] === global.SWITCH_PAGE) {
        debug('SWITCH_PAGE');
        this._switchPage = true;  // Flag on
        continue;
      }
      if (chunk[i] === global.END) {
        debug('END');
        this._mergeElementsUp();
        continue;
      }

      // Process an element
      more    = chunk[i] & 0x40;
      token   = chunk[i] & 0x3F
      name = this._codePages[this._currentPage][token];

      if (!name) {
        var err = new Error('Could not resolve element name. ' +
          'Token: ' + token.toString(16) +
          ' not found in codepage ' + this._currentPage + ' at byte ' + i);
        return done(err);
      }

      // Special case for empty elements
      if (more === 0) {
        var obj = {};
        obj[name] = null;
        this._stack.push(obj);
      } else {
        this._stack.push(name);
      }
    }

    this.push(this._stack.pop());
    return done();
};

Decoder.prototype._mergeElementsUp = function(){
  // Close off the current object
  var bottom = this._stack.pop()
    , top = this._stack.pop();

  debug('top', top);
  debug('bottom', bottom);

  if (!top) {
    this._stack.push(bottom);
    return;
  }

  while (typeof top !== 'string') {
    Object.keys(bottom).forEach(function(name) {
      if (top.hasOwnProperty(name)) {
        // Merge same-named properties into an array
        if (Array.isArray(bottom[name])) {
          top[name] = bottom[name].concat(top[name])
        } else {
          top[name] = [top[name], bottom[name]];
        }
      } else {
        top[name] = bottom[name];
      }
    });
    bottom = top;
    top = this._stack.pop();
    if (!top) {
      this._stack.push(bottom);
      return;
    }
  }

  var obj = {};
  obj[top] = bottom;
  this._stack.push(obj);
};

module.exports = Decoder;
