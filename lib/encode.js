const util = require('util');
const { Transform } = require('stream');
const { TextEncoder } = require('./strings');
const traverse = require('./traverse');
const codes = require('./codes');

const { END, SWITCH_PAGE, STR_I } = codes.global;

let debug;
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function nodeDebug() {
    console.error('WBXML %s', util.format(...arguments));
  };
} else {
  debug = function noop() {};
}

class Encoder extends Transform {
  constructor(opts, cb) {
    super({ readableObjectMode: true });
    opts = opts || {};

    this.charset = opts.charset || 'UTF-8';

    // assign callback
    this.cb = null;
    if (cb) {
      this.cb = cb;
    }
    if (typeof opts === 'function') {
      this.cb = opts;
    }

    // State
    this.buffer = [];
    this.codePages = opts.codepages;
    this.nameSpaces = opts.namespaces;
    this.encoder = new TextEncoder(this.charset);
  }

  _transform(data, encoding, done) {
    try {
      // Push the header
      debug('HEADER');
      this.buffer.push(0x03, 0x01, codes.str2mib[this.charset], 0x00);
      this.inspect(data);

      if (!this.cb) {
        this.emit('raw', this.buffer);
        this.push(new Buffer(this.buffer));
      }
      done();
    } catch (err) {
      done(err);
    }
  }

  inspect(obj) {
    const {
      buffer, nameSpaces, codePages, encoder,
    } = this;
    let element;
    let page;
    let token;
    let node;
    let lastPage = 0;
    const pageAtLevel = [0];

    traverse(obj).forEach(function () {
      let key;
      node = this.node;

      // The root is just a container object
      if (this.isRoot) {
        return;
      }

      // Set the page for this level (will inherit from parent pages)
      // level is always > 0 when we are above the root
      if (pageAtLevel[this.level] == null) {
        pageAtLevel[this.level] = pageAtLevel[this.level - 1];
      }

      // Don't output tag for an array - each item in the array will output its own
      if (util.isArray(this.node)) {
        return;
      }

      // An array containing objects implies each object shares the namespace/tag defined by the parent (property)
      if (util.isArray(this.parent.node)) {
        key = this.parent.key;
      } else {
        key = this.key;
      }

      function parseElement(name, currentPage) {
        // An object can introduce a new namespace by qualifying its property name like this:
        // 'namespace:element': ...
        element = name.split(':', 2);
        if (element.length > 1) {
          page = nameSpaces.indexOf(element[0]);
          if (page === -1) {
            page = currentPage;
          }
          element = element[1];
        } else {
          element = name;
          page = currentPage;
        }
      }

      // Call function after all of the children of the current node are traversed
      this.after(function after() {
        // Don't output end tab for an array - each item in the array will output its own
        if (util.isArray(this.node)) {
          return;
        }

        // Don't output end tab for an empty element
        if (this.node == null) {
          return;
        }

        // For items inside an array, this.key is the array index, not the parent property name
        if (util.isArray(this.parent.node)) {
          debug(new Array(this.level).join(' '), `</${this.parent.key}>`);
        } else {
          debug(new Array(this.level).join(' '), `</${this.key}>`);
        }
        buffer.push(END);
      });

      parseElement(key, pageAtLevel[this.level]);

      if (page !== pageAtLevel[this.level] || page !== lastPage) {
        debug(new Array(this.level).join(' '), 'SWITCH_PAGE: ', page);
        buffer.push(SWITCH_PAGE);
        buffer.push(page);
        lastPage = page;
        pageAtLevel[this.level] = page;
      }

      token = codePages[page][element];

      if (token == null) {
        throw new Error(`WBXML Encoding error: token not found for element ${element} in codepage ${page}`);
      }

      if (node != null) {
        token += 0x40; // More available
      }

      debug(new Array(this.level).join(' '), `<${key}>`, token.toString(16));
      buffer.push(token);

      if (node != null && !util.isArray(node) && typeof node !== 'object') {
        // Stringify numbers and such
        node = node.toString();
        buffer.push(STR_I);
        const bytes = encoder.encode(node);
        for (let i = 0, l = bytes.length; i < l; i++) {
          buffer.push(bytes[i]);
        }

        buffer.push(0x00);
      }
    });
  }

  end(buf, encoding) {
    const self = this;
    Transform.prototype.end.call(this, buf, encoding, () => {
      if (self.cb) {
        self.emit('raw', self.buffer);
        self.cb(null, new Buffer(self.buffer));
      }
    });
  }
}

module.exports = function (opts, cb) {
  const encoder = new Encoder(opts, cb);
  if (typeof cb === 'function') {
    encoder.on('error', cb);
  }
  return encoder;
};

module.exports.Encoder = Encoder;
