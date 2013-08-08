# wbxml

Javascript encoder/decoder for WAP Binary XML Content Format.

## Motivation

WAP Binary XML (WBXML) is a binary representation of XML.  WBXML is used as a compact transmission format for mobile clients, which typically have little memory and bandwidth.
The [specification for WBXML is maintained by W3C](http://www.w3.org/TR/wbxml).

This module can both encode and decode a wbxml Stream.

## Usage

Install using npm.
wbxml's only dependency is [readable-stream](https://github.com/isaacs/readable-stream).  This is just for node 0.8.x support - it will probably be removed at some point.

```
   [sudo] npm install wbxml
```

Now just include in your project

```
   var wbxml = require('wbxml')
```

Currently there are two objects

* `Decoder`: Encodes objects as WBXML string.
* `Encoder`: Decodes input string to Javascript object.

Say you have some XML that looks like this:

```
<people>
  <person>
    <name>Andrew</name>
  </person>
  <person>
    <name>Jenni</name>
    <place>San Francisco</place>
  <person>
</people>
```

Say you wanted to encode the XML as WBXML.
First, you will need to define the codepages - for example:

```
var codepages = [
  // Code Page 0: people
  {
    0x01: 'person'
  },
  // Code Page 1: person
  {
    0x01: 'name',
    0x02: 'place',
  }
]
```

`codepages` is an `Array` of `objects`.  The indexes define the codepage, then the properties of each object define the token.

Second, you will need to define the namespaces that go with the codepage.  This is simply an `Array` of `strings` in the same order as the code pages they represent.

```
var namespaces = [
  // Code Page 0: people
  'people',
  // Code Page 1: person
];
```


Now you can create an object to represent your xml (xml is not directly supported yet as either an input or output).
Javascript objects don't support multiple properties with the same name.
So since our <people> element can contain multiple <person> elements, we use an array for those.
This is a bit tricky - you have to remember that all the objects in the `person` array are implicitly `person` objects.
The object we need to create looks like this:

```
var people = {
  person: [
    {
      name: 'Andrew'
    },
    {
      name: 'Jenni',
      place: 'San Francisco'
    }
  ]
};
```

Now you can do this:

```
// Both codepages and namespaces are required
var encoder = new wbxml.Encoder ({ codepages: codepages, namespaces: namespaces });
encoder.write(people);
var result = encoder.read();

// No namespaces for the decoder
var decoder = new wbxml.Decoder ({ codepages: codepages });
decoder.write(result);
result = decoder.read()
// result now same as people
```

### Codepage

The `codepage` must be provided as an `array` of `objects`.  The index of each object determines the codepage number. Each object contains key-value where `key` is an octal tag id and `value` is a string.

## Progress

This is a first pass and only implements:

- WBXML tokens to encode XML tags
- WBXML code pages to support multiple XML namespaces
- Inline strings
- Opaque data

The following features are not yet implemented:

- [String tables](http://www.w3.org/TR/wbxml/#_Toc443384901)
- [Entities](http://www.w3.org/TR/wbxml/#_Toc443384909)
- [Processing instructions](http://www.w3.org/TR/wbxml/#_Toc443384910)
- Attribute encoding

In addition, the following things

- Decoder: Needs options to always return namespace-prefixed property names
- Encoder: Ignore properties that don't belong
- Combine codepages and namespaces into a single input
- Streaming xml into the encoder
- Streaming xml from the decoder (i.e. with events)
- More tests
- There are a few code TODOs and opportunities for performance improvements

## Resources

https://libwbxml.opensync.org/
http://kxml.sourceforge.net/

#### Author: [Andrew Dalgleish](http://andrew.dalgleish.info)
#### License: BSD

