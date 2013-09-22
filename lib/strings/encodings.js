
/** @type {Array.<{encodings: Array.<{name:string,labels:Array.<string>}>,
   *      heading: string}>} */
var encodings = [
  {
    "encodings": [
      {
        "labels": [
          "unicode-1-1-utf-8",
          "utf-8",
          "utf8"
        ],
        "name": "utf-8"
      }
    ],
    "heading": "The Encoding"
  },
  {
    "encodings": [
      {
        "labels": [
          "utf-16be"
        ],
        "name": "utf-16be"
      },
      {
        "labels": [
          "utf-16",
          "utf-16le"
        ],
        "name": "utf-16le"
      }
    ],
    "heading": "Legacy miscellaneous encodings"
  },
  {
    'encodings': [
      {
        'labels': [
          'utf-16',
          'utf-16le'
        ],
        'name': 'utf-16'
      },
      {
        'labels': [
          'utf-16be'
        ],
        'name': 'utf-16be'
      }
    ],
    'heading': 'Legacy utf-16 encodings'
  }
];

module.exports = encodings;

