"use strict";

var util = require('util'),
  stream = require('stream');

// For Node 0.8 users
if (!stream.Transform) {
  stream = require('readable-stream');
}

var globalCodes = require('./codes').global;

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
}
util.inherits(Encoder, stream.Transform);


Encoder.prototype._inspect = function (obj, parentPage) {
  var element
    , page
    , token
    , value
    , type
    , currentPage = parentPage
    , buffer = this._buffer
    , nameSpaces = this._nameSpaces
    , codePages = this._codePages
    , that = this;

  type = typeof obj;
  if (type === 'undefined' || obj === null) {
    return;
  }

  if (type === 'number' || type === 'boolean') {
    // inline string
    obj = obj.toString();
  }

  // Now handle unicode
  if (typeof obj === 'string') {
    // inline string
    buffer.push(globalCodes.STR_I);
    // TODO: Seems very inefficient and doesn't work for all unicode. Another way?
    var buf = new Buffer(obj, 'utf8');
    for (var b = 0, l = buf.length; b < l; b++){
      buffer.push(buf[b]);
    }
    buffer.push(0x00);
    debug('STR_I', obj);
    return;
  }

  Object.keys(obj).forEach(function(key) {
    // An object can introduce a new namespace by qualifying its property name like this:
    // 'namespace:element': ...
    element = key.split(':', 2);
    if(element.length > 1) {
      page = nameSpaces.indexOf(element[0]) || parentPage;
      element = element[1];
    } else {
      element = key;
      page = parentPage;
    }

    if (page !== currentPage) {
      debug('SWITCH_PAGE: ', page);
      buffer.push(globalCodes.SWITCH_PAGE);
      buffer.push(page);
      currentPage = page;
    }

    token = codePages[page][element];

    if (!token) {
      throw new Error('WBXML Encoding error: token not found for element ' + element + ' in codepage ' + page);
    }

    value = obj[key];

    if (value !== null) {
      token += 0x40;
    }

    if (Array.isArray(value)){
      // Special case
      value.forEach(function(nested){
        debug(token, '('+element+')');
        buffer.push(token);
        that._inspect(nested, page);
        buffer.push(globalCodes.END);
      });
    } else {
      debug(token, '('+element+')');
      if (value === null){
        // Empty token
        buffer.push(token);
      } else {
        buffer.push(token);
        that._inspect(value, page);
        debug('END', '('+element+')');
        buffer.push(globalCodes.END);
      }
    }
  });

  // Restore page if it was changed
  // TODO: This causes excess switch pages at the end of the stream
  if (currentPage !== parentPage) {
    debug('SWITCH_PAGE: ', parentPage);
    buffer.push(globalCodes.SWITCH_PAGE);
    buffer.push(parentPage);
  }
};

Encoder.prototype._transform = function (data, encoding, done) {

  try {
    // Push the header
    debug('HEADER');
    this._buffer.push(0x03, 0x01, 0x6a, 0x00);
    this._inspect(data, 0);

    if (!this.cb) {
      this.emit('raw', this._buffer);
      this.push(new Buffer(this._buffer));
    }
    done();
  } catch (err) {
    done(err);
  }
};

Encoder.prototype.end = function (buf, encoding) {
  var self = this;
  stream.Transform.prototype.end.call(this, buf, encoding, function () {
    if (self.cb) {
      self.emit('raw', self._buffer);
      self.cb(null, new Buffer(self._buffer));
    }
  });
};