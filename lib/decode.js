const util = require('util');
const { Transform } = require('stream');
const { TextDecoder } = require('./strings');
const codes = require('./codes');

const { STR_I, SWITCH_PAGE, END } = require('./codes').global;

const unsupported = [0x02, 0x04, 0x40, 0x41, 0x42, 0x43, 0x44, 0x80, 0x81, 0x82, 0x83, 0x84, 0xC0, 0xC1, 0xC2, 0xC3, 0xC4];

let debug;
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function () {
    console.error('WBXML %s', util.format(...arguments));
  };
} else {
  debug = function () {};
}

function binify(src) {
  const dest = new Uint8Array(src.length);
  for (let i = 0, l = src.length; i < l; i++) {
    dest[i] = src[i];
  }
  return dest;
}

class Decoder extends Transform {
  constructor(opts, cb) {
    super({ readableObjectMode: true });
    opts = opts || {};

    // assign callback
    this.cb = null;
    if (cb) {
      this.cb = cb;
    }
    if (typeof opts === 'function') {
      this.cb = opts;
    }

    this.codePages = opts.codepages;

    // State
    this.currentPage = 0;
    this.switchPage = false;
    this.inlineString = false;
    this.stringBuffer = [];
    this.header = { complete: false };
    this.stack = [];
    this.mb_uint32_buffer = 0;
  }

  /* Header - First 4 bytes
         *
         * version     <- WBXML version number
         *                            Contains the major version minus one
         *                            in the upper four bits / minor version in the lower
         *                            We should fail its < 0x01 or > 0x03
         * publicid    <- Document Public Identifier
         *                            (Usually this is 0x01 for 'unknown')
         * charset     <- multi-byte positive integer value representing the
         *                            IANA-assigned    MIB number for a character set
         *                            (utf-8 assumed)
         * strtbl        <- String Table
         *                            (not used for activesync so this should always be 0x00)
         */
  _transform(line, encoding, processed) {
    try {
      this.parse(line);
      processed();
    } catch (err) {
      processed(err);
    }
  }

  parse(chunk) {
    let i = 0;
    const length = chunk.length;
    let token;
    let more;
    let tag;
    let attributes; // TODO: Support attributes
    const that = this;

    if (length === 0) {
      return;
    }

    this.emit('raw', chunk);

    function get_mb_uint32() {
      const b = chunk[i];
      that.mb_uint32_buffer = that.mb_uint32_buffer * 128 + (b & 0x7f);

      if (b & 0x80) { return false; } return true;
    }

    for (; i < length; i++) {
      if (!this.header.complete) {
        if (!this.header.version) {
          this.header.version = chunk[i];
          continue;
        }
        if (!this.header.publicid) {
          if (get_mb_uint32()) {
            this.header.publicid = this.mb_uint32_buffer;
            this.mb_uint32_buffer = 0;
          }
          continue;
        }
        if (!this.header.charset) {
          if (get_mb_uint32()) {
            this.header.charset = codes.mib2str[this.mb_uint32_buffer] || 'unknown';
            this.decoder = new TextDecoder(this.header.charset);
            this.mb_uint32_buffer = 0;
          }

          continue;
        }
        // TODO: Support stringtables
        if (!this.header.strtbl) {
          if (get_mb_uint32()) {
            this.header.strtbl = this.mb_uint32_buffer;
            this.mb_uint32_buffer = 0;
            this.header.complete = true;
          }

          continue;
        }
      }

      if (this.inlineString) {
        for (; i < length; i++) {
          // look for termstr (0x00)
          if (chunk[i] === 0) {
            const str = this.decoder.decode(binify(this.stringBuffer));
            debug(str);
            this.stack.push(str);
            break;
          }

          this.stringBuffer.push(chunk[i]);
        }

        if (i < length) {
          this.stringBuffer = [];
          this.inlineString = false;
        }
        continue;
      }
      if (this.switchPage) {
        if (chunk[i] < 0 || chunk[i] >= this.codePages.length) {
          throw new Error(`Unknown code page ID ${this.currentPage.toString(16)} encountered in WBXML`);
        }
        this.currentPage = chunk[i];

        debug('PAGE ', chunk[i]);
        this.switchPage = false;
        continue;
      }
      if (chunk[i] === STR_I) {
        debug('STR_I');
        this.inlineString = true;
        continue;
      }
      if (chunk[i] === SWITCH_PAGE) {
        debug('SWITCH_PAGE');
        this.switchPage = true;
        continue;
      }
      if (chunk[i] === END) {
        debug('END');
        this._mergeElementsUp();
        continue;
      }
      // TODO: Support other global codes
      if (unsupported.indexOf(chunk[i]) !== -1) {
        throw new Error(`Encountered unknown global token: ${chunk[i]}`);
      }

      // If it's not a global token, it should be a tag
      more = (chunk[i] & 0x40);
      token = (chunk[i] & 0x3F);
      attributes = (chunk[i] & 0x80);
      tag = this.codePages[this.currentPage][token];

      if (attributes) {
        throw new Error('Attributes are not supported');
      }

      if (!tag) {
        throw new Error(`${'Could not resolve element\'s name. '
                        + 'Token: \''}${token.toString(16)}' not found in codepage ${this.currentPage} at byte '${i}'`);
      }

      // Special case for empty elements
      if (more === 0) {
        const obj = {};
        obj[tag] = null;
        this.stack.push(obj);
      } else {
        this.stack.push(tag);
      }
    }

    if (!this.cb) {
      this.push(this.stack.pop());
    }
  }

  _mergeElementsUp() {
    // Close off the current object
    let bottom = this.stack.pop();


    let top = this.stack.pop();

    debug('top', top);
    debug('bottom', bottom);

    if (!top) {
      this.stack.push(bottom);
      return;
    }

    function checkForPropertyNameCollisions(name) {
      if (top.hasOwnProperty(name)) {
        // Merge same-named properties into an array
        if (Array.isArray(bottom[name])) {
          top[name] = bottom[name].concat(top[name]);
        } else {
          top[name] = [top[name], bottom[name]];
        }
      } else {
        top[name] = bottom[name];
      }
    }

    while (typeof top !== 'string') {
      Object.keys(bottom).forEach(checkForPropertyNameCollisions);
      bottom = top;
      top = this.stack.pop();
      if (!top) {
        this.stack.push(bottom);
        return;
      }
    }

    const obj = {};
    obj[top] = bottom;
    this.stack.push(obj);
  }

  end(buf, encoding) {
    const self = this;
    Transform.prototype.end.call(this, buf, encoding, () => {
      if (self.cb) {
        self.cb(null, self.stack.pop());
      }
    });
  }
}

module.exports = function (opts, cb) {
  const decoder = new Decoder(opts, cb);
  if (typeof cb === 'function') {
    decoder.on('error', cb);
  }
  return decoder;
};

module.exports.Decoder = Decoder;
