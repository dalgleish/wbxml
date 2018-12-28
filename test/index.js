const assert = require('assert');
const wbxml = require('../lib');
const fs = require('fs');
const activesync = require('./activesync');
const codepages = activesync.codepages;
const namespaces = activesync.namespaces;

describe('decode without callback', function() {
  it('decode foldersync with synckey 0', function (done) {
    var decoder = wbxml.Decoder({codepages: codepages}),
      fstream = fs.createReadStream(__dirname + '/fixtures/folder-sync-init-request.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.json', {encoding: 'utf8'}));

    decoder.on('readable', function () {
      var obj = decoder.read();
      assert.deepEqual(obj, json);
    })

    decoder.on('end', function () {
      done();
    })

    fstream.pipe(decoder);
  })

  it('decode sync with add command', function (done) {
    var decoder = wbxml.Decoder({codepages: codepages}),
      fstream = fs.createReadStream(__dirname + '/fixtures/sync-add.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add.json', {encoding: 'utf8'}));

    decoder.on('readable', function () {
      var obj = decoder.read();
      assert.deepEqual(obj, json);
    })

    decoder.on('end', function () {
      done();
    })

    fstream.pipe(decoder);
  })

  it('decode itemoperations with null body', function (done) {
    var decoder = wbxml.Decoder({codepages: codepages}),
      fstream = fs.createReadStream(__dirname + '/fixtures/calendar-item-with-null-body.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body.json', {encoding: 'utf8'}));

    decoder.on('readable', function () {
      var obj = decoder.read();
      assert.deepEqual(obj, json);
    })

    decoder.on('end', function () {
      done();
    })

    fstream.pipe(decoder);
  })
})
//
// describe('decode with callback', function() {
//   it('decode foldersync with synckey 0', function (done) {
//     var decoder = wbxml.Decoder({codepages}, cb),
//       fstream = fs.createReadStream(__dirname + '/fixtures/folder-sync-init-request.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.json', {encoding: 'utf8'}));
//
//     function cb (err, obj) {
//       if (err) throw err;
//       assert.deepEqual(obj, json);
//       done()
//     }
//
//     fstream.pipe(decoder)
//   })
//
//   it('decode sync with add command', function (done) {
//     var decoder = wbxml.Decoder({codepages}, cb),
//       fstream = fs.createReadStream(__dirname + '/fixtures/sync-add.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add.json', {encoding: 'utf8'}));
//
//     function cb (err, obj) {
//       if (err) throw err;
//       assert.deepEqual(obj, json);
//       done()
//     }
//
//     fstream.pipe(decoder)
//   })
//
//   it('decode itemoperations with null body', function (done) {
//     var decoder = wbxml.Decoder({codepages}, cb),
//       fstream = fs.createReadStream(__dirname + '/fixtures/calendar-item-with-null-body.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body.json', {encoding: 'utf8'}));
//
//     function cb (err, obj) {
//       if (err) throw err;
//       assert.deepEqual(obj, json);
//       done()
//     }
//
//     fstream.pipe(decoder)
//   })
// })
//
// describe('encode without callback', function() {
//   it('encode foldersync with synckey 0', function (done) {
//
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     });
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request-with-namespace.json', {encoding: 'utf8'}));
//
//     encoder.on('readable', function () {
//       var buffer = encoder.read();
//       for(var i = 0; i < correct.length; i++){
//         assert.equal(buffer[i], correct[i]);
//       }
//     })
//
//     encoder.on('end', function () {
//       done();
//     })
//
//     encoder.write(json);
//     encoder.end()
//   })
//
//   it('sync with add command', function (done) {
//
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     });
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/sync-add.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add-with-namespace.json', {encoding: 'utf8'}));
//
//     encoder.on('readable', function () {
//       var buffer = encoder.read();
//       var out = '';
//       for(var i = 0; i < correct.length; i++){
//         out += (' ' + buffer[i].toString(16));
//         if (buffer[i] !== correct[i]) {
//           console.log(out)
//           console.log('failed at ', i)
//         }
//         assert.equal(buffer[i], correct[i]);
//       }
//     })
//
//     encoder.on('end', function () {
//       done();
//     })
//
//     encoder.write(json);
//     encoder.end()
//   })
//
//   it('itemoperations with null body', function (done) {
//
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     });
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body-with-namespace.json', {encoding: 'utf8'}));
//
//     encoder.on('readable', function () {
//       var buffer = encoder.read();
//       var out = '';
//       for(var i = 0; i < correct.length; i++){
//         out += (' ' + buffer[i].toString(16));
//         if (buffer[i] !== correct[i]) {
//           console.log(out)
//           console.log('failed at ', i)
//         }
//         assert.equal(buffer[i], correct[i]);
//       }
//     })
//
//     encoder.on('end', function () {
//       done();
//     })
//
//     encoder.write(json);
//     encoder.end()
//   })
// })
//
// describe('encode with callback', function() {
//   it('foldersync with synckey 0', function (done) {
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     }, cb);
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request-with-namespace.json', {encoding: 'utf8'}));
//
//     function cb (err, buffer) {
//       if (err) throw err;
//       for(var i = 0; i < correct.length; i++){
//         assert.equal(buffer[i], correct[i]);
//       }
//       done()
//     }
//
//     encoder.write(json);
//     encoder.end()
//   })
//
//   it('sync with add command', function (done) {
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     }, cb);
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/sync-add.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add-with-namespace.json', {encoding: 'utf8'}));
//
//     function cb (err, buffer) {
//       if (err) throw err;
//       for(var i = 0; i < correct.length; i++){
//         assert.equal(buffer[i], correct[i]);
//       }
//       done()
//     }
//
//     encoder.write(json);
//     encoder.end()
//   })
//
//   it('itemoperations with null body', function (done) {
//     var encoder = wbxml.Encoder({
//       codepages,
//       namespaces
//     }, cb);
//
//     var correct = fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body.hex'),
//       json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/calendar-item-with-null-body-with-namespace.json', {encoding: 'utf8'}));
//
//     function cb (err, buffer) {
//       if (err) throw err;
//       for(var i = 0; i < correct.length; i++){
//         assert.equal(buffer[i], correct[i]);
//       }
//       done()
//     }
//
//     encoder.write(json);
//     encoder.end()
//   })
// })
