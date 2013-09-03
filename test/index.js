var assert = require('assert'),
    wbxml = require('../lib/index'),
    fs = require('fs'),
    activesync = require('./activesync'),
    codepages = activesync.codepages,
    namespaces = activesync.namespaces;

describe('decode without callback', function() {
  it('foldersync with synckey 0', function (done) {
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

  it('sync with add command', function (done) {
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
})

describe('decode with callback', function() {
  it('foldersync with synckey 0', function (done) {
    var decoder = wbxml.Decoder({codepages: codepages}, cb),
      fstream = fs.createReadStream(__dirname + '/fixtures/folder-sync-init-request.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.json', {encoding: 'utf8'}));

    function cb (err, obj) {
      if (err) throw err;
      assert.deepEqual(obj, json);
      done()
    }

    fstream.pipe(decoder)
  })

  it('sync with add command', function (done) {
    var decoder = wbxml.Decoder({codepages: codepages}, cb),
      fstream = fs.createReadStream(__dirname + '/fixtures/sync-add.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add.json', {encoding: 'utf8'}));

    function cb (err, obj) {
      if (err) throw err;
      assert.deepEqual(obj, json);
      done()
    }

    fstream.pipe(decoder)
  })
})

describe('encode without callback', function() {
  it('foldersync with synckey 0', function (done) {

    var encoder = wbxml.Encoder({
      codepages: codepages,
      namespaces: namespaces
    });

    var correct = fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request-with-namespace.json', {encoding: 'utf8'}));

    encoder.on('readable', function () {
      var buffer = encoder.read();
      for(var i = 0; i < correct.length; i++){
        assert.equal(buffer[i], correct[i]);
      }
    })

    encoder.on('end', function () {
      done();
    })

    encoder.write(json);
    encoder.end()
  })

  it('sync with add command', function (done) {

    var encoder = wbxml.Encoder({
      codepages: codepages,
      namespaces: namespaces
    });

    var correct = fs.readFileSync(__dirname + '/fixtures/sync-add.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add-with-namespace.json', {encoding: 'utf8'}));

    encoder.on('readable', function () {
      var buffer = encoder.read();
      var out = '';
      for(var i = 0; i < correct.length; i++){
        out += (' ' + buffer[i].toString(16));
        if (buffer[i] !== correct[i]) {
          console.log(out)
          console.log('failed at ', i)
        }
        assert.equal(buffer[i], correct[i]);
      }
      console.log(out)
    })

    encoder.on('end', function () {
      done();
    })

    encoder.write(json);
    encoder.end()
  })
})

describe('encode with callback', function() {
  it('foldersync with synckey 0', function (done) {
    var encoder = wbxml.Encoder({
      codepages: codepages,
      namespaces: namespaces
    }, cb);

    var correct = fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/folder-sync-init-request-with-namespace.json', {encoding: 'utf8'}));

    function cb (err, buffer) {
      if (err) throw err;
      for(var i = 0; i < correct.length; i++){
        assert.equal(buffer[i], correct[i]);
      }
      done()
    }

    encoder.write(json);
    encoder.end()
  })

  it('sync with add command', function (done) {
    var encoder = wbxml.Encoder({
      codepages: codepages,
      namespaces: namespaces
    }, cb);

    var correct = fs.readFileSync(__dirname + '/fixtures/sync-add.hex'),
      json = JSON.parse(fs.readFileSync(__dirname + '/fixtures/sync-add-with-namespace.json', {encoding: 'utf8'}));

    function cb (err, buffer) {
      if (err) throw err;
      for(var i = 0; i < correct.length; i++){
        assert.equal(buffer[i], correct[i]);
      }
      done()
    }

    encoder.write(json);
    encoder.end()
  })
})
