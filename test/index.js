var wbxml = require('../lib/index');
var codepages = require('./activesync').codepages;
var namespaces = require('./activesync').namespaces;

exports.decode = {
  "decode empty element" : function(t) {
    var encoded = [0x03, 0x01, 0x6A, 0x00, 0x05, 0x01];
    var buffer = new Buffer(encoded);

    var decoder = new wbxml.Decoder({
      codepages: codepages,
      objectMode: true
    });

    decoder.write(buffer);
    var res = decoder.read();

    decoder.end();

    process.nextTick(function() {
      t.done();
    })
  },
  "decode simple" : function(t) {
    var input = new Buffer([0x03, 0x01, 0x6A, 0x00, 0x00, 0x07, 0x56, 0x52, 0x03, 0x30, 0x00, 0x01, 0x01]);

    var correct = {
      'FolderSync': {
        'SyncKey': '0'
      }
    };

    var decoder = new wbxml.Decoder({
      codepages: codepages,
      objectMode: true
    });

    var result;

    decoder.write(input);
    result = decoder.read();

    decoder.end();

    process.nextTick(function() {
      t.deepEqual(result, correct);
      t.done();
    })
  },
  "decode complex" : function(t) {
    var input = new Buffer([0x03, 0x01, 0x6A, 0x00, 0x45, 0x5C, 0x4F, 0x50, 0x03, 0x43, 0x6F, 0x6E, 0x74,
      0x61, 0x63, 0x74, 0x73, 0x00, 0x01, 0x4B, 0x03, 0x32, 0x00, 0x01, 0x52, 0x03,
      0x32, 0x00, 0x01, 0x4E, 0x03, 0x31, 0x00, 0x01, 0x56, 0x47, 0x4D, 0x03, 0x32,
      0x3A, 0x31, 0x00, 0x01, 0x5D, 0x00, 0x11, 0x4A, 0x46, 0x03, 0x31, 0x00, 0x01,
      0x4C, 0x03, 0x30, 0x00, 0x01, 0x4D, 0x03, 0x31, 0x00, 0x01, 0x01, 0x00, 0x12,
      0x67, 0x03, 0x46, 0x75, 0x6E, 0x6B, 0x2C, 0x20, 0x44, 0x6F, 0x6E, 0x00, 0x01,
      0x67, 0x03, 0x44, 0x6F, 0x6E, 0x00, 0x01, 0x67, 0x03, 0x46, 0x75, 0x6E, 0x6B,
      0x00, 0x01, 0x00, 0x11, 0x56, 0x03, 0x31, 0x00, 0x01, 0x01, 0x01, 0x01, 0x01,
      0x01, 0x01]);

    var correct = {
      'Sync': {
        Collections: {
          Collection: {
            Class: 'Contacts',
            SyncKey: '2',
            CollectionId: '2',
            Status: '1',
            Commands:
            {
              Add: {
                ServerId: '2:1',
                ApplicationData: {
                  'Body': {
                    Type: '1',
                    EstimatedDataSize: '0',
                    Truncated: '1'
                  },
                  'AccountName':[ 'Don','Funk','Funk, Don' ],
                  'NativeBodyType': '1'
                }
              }
            }
          }
        }
      }
    };

    var decoder = new wbxml.Decoder({
      codepages: codepages,
      objectMode: true
    });

    decoder.write(input);
    result = decoder.read();

    decoder.end();

    process.nextTick(function() {
      t.deepEqual(result, correct);
      t.done();
    })
  },
  "encode simple" : function(t) {

    var input = {
      'FolderHierarchy:FolderSync': {
        'SyncKey': '0'
      }
    };

    var correct = [0x03, 0x01, 0x6A, 0x00, 0x00, 0x07, 0x56, 0x52, 0x03, 0x30, 0x00, 0x01, 0x01, 0x00, 0x00];

    var encoder = new wbxml.Encoder({
      codepages: codepages,
      namespaces: namespaces,
      objectMode: true
    });

    encoder.write(input);

    var result = encoder.read();


    encoder.on('finish', function() {
      var xxx = [];
      for(var i = 0; i < result.length; i++){
        xxx.push(result[i]);
      }

      t.deepEqual(xxx, correct);
      t.done();
    });

    encoder.end();
  }
};
