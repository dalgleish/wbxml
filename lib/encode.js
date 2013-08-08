var util = require('util'),
  Transform = require('readable-stream/transform'),
  global = require('./codes').global;

var debug
if (/\wbxml\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    console.error('WBXML %s', util.format.apply(util, arguments))
  }
} else {
  debug = function() {}
}

function Encoder(options) {
  if (!(this instanceof Encoder))
    return new Encoder(options);

  Transform.call(this, options);

  this._nameSpaces = options.namespaces;
  this._codePages = options.codepages;
  this._buffer = [];

  var page, value, codepages = this._codePages;

  // key is radix 16 (hexadecimal)
  var setPageValue = function(key) {
    value = page[key];
    page[value] = parseInt(key, 10);
  };

  // Annotate codepage (for performance)
  for(var i = 0, l = codepages.length; i < l; i++) {
    page = codepages[i]; // Object
    Object
      .keys(page)// 0x05, 0x06, etc.
      .forEach(setPageValue);
  }
}
util.inherits(Encoder, Transform);

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
  if (type === 'undefined' || obj === null) return;

  if (type === 'number' || type === 'boolean') {
    // inline string
    obj = obj.toString();
  }

  // Now handle unicode
  if (typeof obj === 'string') {
    // inline string
    buffer.push(global.STR_I);
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
      buffer.push(global.SWITCH_PAGE);
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
        buffer.push(global.END);
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
        buffer.push(global.END);
      }
    }
  });

  // Restore page if it was changed
  // TODO: This causes excess switch pages at the end of the stream
  if (currentPage !== parentPage) {
    debug('SWITCH_PAGE: ', parentPage);
    buffer.push(global.SWITCH_PAGE);
    buffer.push(parentPage);
  }
};

Encoder.prototype._transform = function (data, encoding, done) {

  try {
    // Push the header
    debug('HEADER');
    this._buffer.push(0x03, 0x01, 0x6a, 0x00);

    this._inspect(data, 0);

    this.emit('raw', this._buffer);

    this.push(new Buffer(this._buffer));

    done();
  } catch(err){
    console.log('error ', err)
    done(err)
  }
};

module.exports = Encoder;