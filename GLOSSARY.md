# wbxml

Conversion between WBXML (WAP Binary XML) and an in-memory representation of the XML document it encodes.

## Language

**Decode**:
Turning WBXML bytes into a document.
_Avoid_: Parse, deserialize

**Encode**:
Turning a document into WBXML bytes.
_Avoid_: Serialize, compile

**Document**:
The lossless tree of elements, attributes, text, opaque data and processing instructions that a WBXML message encodes, preserving sibling order. The single source of truth for what a message says.
_Avoid_: Object, JSON, message body

**Charset**:
The scheme that turns every string in a document (inline strings and the string table) into bytes, named in the header by its IANA MIBenum. Opaque data has no charset.
_Avoid_: Encoding, character encoding

**String table**:
The block of terminated strings after a message's header, which tokens refer to by byte offset instead of repeating the string inline. It is always present, possibly empty. A reference can point into the middle of a string, so one entry can serve several strings that share an ending.
_Avoid_: String pool, dictionary

**WBXML version**:
The version of the WBXML format a message is written in (1.1, 1.2 or 1.3), given by the first header byte. Unrelated to a language's own protocol versions, such as ActiveSync 16.1.
_Avoid_: Version (on its own), protocol version

**Code page**:
One numbered table within a language table, mapping single-byte tokens either to tag names (a tag code page) or to attribute starts and attribute values (an attribute code page). Tag and attribute code pages are numbered separately.
_Avoid_: Namespace, page

**Namespace**:
The XML namespace name shared by every tag on a tag code page. A namespace and a name together identify an element.
_Avoid_: Code page, prefix

**Language**:
An XML vocabulary carried over WBXML, such as ActiveSync or SyncML. Each language has one language table; the core knows nothing about any particular language.
_Avoid_: Implementor, application, standard, protocol

**Language table**:
The full set of code pages for one XML vocabulary (e.g. ActiveSync), needed to encode or decode documents in that vocabulary.
_Avoid_: Codepages, dictionary, schema
