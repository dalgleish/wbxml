"use strict";

var util = require('util'),
    stream = require('stream'),
    TextEncoder = require('./strings').TextEncoder,
    traverse = require('traverse');

// For Node 0.8 users
if (!stream.Transform) {
  stream = require('readable-stream');
}
var codes = require('./codes');
var globalCodes = codes.global;

var debug;
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    console.error('WBXML %s', util.format.apply(util, arguments));
  };
} else {
  debug = function() {};
}

module.exports = function (opts, cb) {
  var encoder = new Encoder(opts, cb);
  if (typeof cb === 'function') {
    encoder.on('error', cb);
  }
  return encoder;
};

module.exports.Decoder = Encoder;

function Encoder (opts, cb) {
  opts = opts || {};
  // Encoder is always in object mode
  opts.objectMode = true;

  this._charset = opts.charset || 'UTF-8';

  stream.Transform.call(this, opts);

  // assign callback
  this.cb = null;
  if (cb) {
    this.cb = cb;
  }
  if (typeof opts === 'function') {
    this.cb = opts;
  }

  // State
  this._buffer = [];
  this._codePages = opts.codepages;
  this._nameSpaces = opts.namespaces;
  this._encoder = new TextEncoder(this._charset);
}
util.inherits(Encoder, stream.Transform);

Encoder.prototype._transform = function (data, encoding, done) {

  try {
    // Push the header
    debug('HEADER');
    this._buffer.push(0x03, 0x01, codes.str2mib[this._charset], 0x00);
    this._inspect(data);

    if (!this.cb) {
      this.emit('raw', this._buffer);
      this.push(new Buffer(this._buffer));
    }
    done();
  } catch (err) {
    done(err);
  }
};

var _inspect = function (obj) {
  var element
    , page
    , token
    , buffer = this._buffer
    , nameSpaces = this._nameSpaces
    , codePages = this._codePages
    , node
    , encoder = this._encoder
    , lastPage = 0
    , pageAtLevel = [0];

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

  traverse(obj).forEach(function() {
    var key;
    node = this.node;

    // The root is just a container object
    if (this.isRoot) {
      return;
    }

    // Set the page for this level (will inherit from parent pages)
    // level is always > 0 when we are above the root
    if (pageAtLevel[this.level] == null) {
      pageAtLevel[this.level] = pageAtLevel[this.level-1];
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

    // Call function after all of the children of the current node are traversed
    this.after(function() {
      // Don't output end tab for an array - each item in the array will output its own
      if (util.isArray(this.node)) {
        return;
      }

      // For items inside an array, this.key is the array index, not the parent property name
      if (util.isArray(this.parent.node)) {
        debug(new Array(this.level).join(' '), '</'+this.parent.key+'>');
      } else {
        debug(new Array(this.level).join(' '), '</'+this.key+'>');
      }
      buffer.push(globalCodes.END);
    });

    parseElement(key, pageAtLevel[this.level]);

    if (page !== pageAtLevel[this.level] || page !== lastPage) {
      debug(new Array(this.level).join(' '), 'SWITCH_PAGE: ', page);
      buffer.push(globalCodes.SWITCH_PAGE);
      buffer.push(page);
      pageAtLevel[this.level] = lastPage = page;
    }

    token = codePages[page][element];

    if (token == null) {
      throw new Error('WBXML Encoding error: token not found for element ' + element + ' in codepage ' + page);
    }

    if (node != null) {
      token += 0x40; // More available
    }

    debug(new Array(this.level).join(' '), '<'+key+'>', token.toString(16));
    buffer.push(token);

    if (node != null && !util.isArray(node) && typeof node !== 'object') {
      // Stringify numbers and such
      node = node.toString();
      buffer.push(globalCodes.STR_I);
      var bytes = encoder.encode(node);
      for (var i = 0, l = bytes.length; i < l; i++){
        buffer.push(bytes[i]);
      }

      buffer.push(0x00);
    }
  });
};

Encoder.prototype._inspect = _inspect;

Encoder.prototype.end = function (buf, encoding) {
  var self = this;
  stream.Transform.prototype.end.call(this, buf, encoding, function () {
    if (self.cb) {
      self.emit('raw', self._buffer);
      self.cb(null, new Buffer(self._buffer));
    }
  });
};
