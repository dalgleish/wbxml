var encodings = require('./encodings');

var name_to_encoding = {};
var label_to_encoding = {};
encodings.forEach(function(category) {
  category.encodings.forEach(function(encoding) {
    name_to_encoding[encoding.name] = encoding;
    encoding.labels.forEach(function(label) {
      label_to_encoding[label] = encoding;
    });
  });
});

/**
 * @param {string} label The encoding label.
 * @return {?{name:string,labels:Array.<string>}}
 */
function getEncoding(label) {
  label = String(label).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(label_to_encoding, label)) {
    return label_to_encoding[label];
  }
  return null;
}

module.exports.encodings = encodings;
module.exports.getEncoding = getEncoding;

name_to_encoding['utf-8'].getEncoder = function(options) {
  return new (require('./Utf8Encoder'))(options);
};
name_to_encoding['utf-8'].getDecoder = function(options) {
  return new (require('./Utf8Decoder'))(options);
};
name_to_encoding['utf-16'].getEncoder = function(options) {
  return new (require('./Utf16Encoder'))(false, options);
};
name_to_encoding['utf-16'].getDecoder = function(options) {
  return new (require('./Utf16Decoder'))(false, options);
};
name_to_encoding['utf-16be'].getEncoder = function(options) {
  return new (require('./Utf16Encoder'))(true, options);
};
name_to_encoding['utf-16be'].getDecoder = function(options) {
  return new (require('./Utf16Decoder'))(true, options);
};

