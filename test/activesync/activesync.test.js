import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decode, encode } from 'wbxml';
import { activesync } from 'wbxml/activesync';
import { hex, prng, generateDocument, checkRoundTrips, checkMutants } from '../helpers.js';

const fixture = (name) => new URL(name, import.meta.url);
const el = (namespace, name, ...children) => ({ type: 'element', namespace, name, attributes: [], children });
const str = (value) => ({ type: 'text', value });
const leaf = (namespace, name, value) => el(namespace, name, str(value));

const pages = Object.entries(activesync.tagPages);
const nameAt = (page, token) => activesync.tagPages[page]?.tags[token];

test('the root entry does not re-export the table', async () => {
  const root = await import('wbxml');
  assert.deepEqual(Object.keys(root).sort(), ['WbxmlError', 'decode', 'encode']);
});

test('the table has 26 code pages minus empty AirNotify, and 608 tokens', () => {
  assert.equal(pages.length, 25);
  assert.deepEqual(
    pages.map(([page]) => Number(page)),
    [...Array(26).keys()].filter((page) => page !== 3),
  );
  assert.equal(activesync.tagPages[3], undefined);
  assert.equal(pages.reduce((n, [, page]) => n + Object.keys(page.tags).length, 0), 608);
});

test('namespaces are the MS-ASCMD names, with no colon', () => {
  assert.deepEqual(
    pages.map(([, page]) => page.namespace),
    ['AirSync', 'Contacts', 'Email', 'Calendar', 'Move', 'GetItemEstimate', 'FolderHierarchy', 'MeetingResponse',
      'Tasks', 'ResolveRecipients', 'ValidateCert', 'Contacts2', 'Ping', 'Provision', 'Search', 'GAL', 'AirSyncBase',
      'Settings', 'DocumentLibrary', 'ItemOperations', 'ComposeMail', 'Email2', 'Notes', 'RightsManagement', 'Find'],
  );
  for (const [, page] of pages) assert.doesNotMatch(page.namespace, /:/);
});

test('the table is a frozen language with no attribute pages', () => {
  assert.equal(activesync.publicId, 1);
  assert.equal(activesync.literals, false);
  assert.equal(activesync.attributePages, undefined);
  const frozen = (value, path) => {
    assert.ok(Object.isFrozen(value), `${path} is frozen`);
    for (const [key, child] of Object.entries(value)) {
      if (child !== null && typeof child === 'object') frozen(child, `${path}.${key}`);
    }
  };
  frozen(activesync, 'activesync');
  assert.throws(() => { activesync.tagPages[0].tags[5] = 'x'; }, TypeError);
});

// [code page, token, current name, name in the 2009 table]
const renamed = [
  [2, 0x09, 'AttOid', 'Att0Id'], [2, 0x1D, 'DtStamp', 'DTStamp'],
  [2, 0x29, 'Type', 'Recurrence_Type'], [2, 0x2A, 'Until', 'Recurrence_Until'],
  [2, 0x2B, 'Occurrences', 'Recurrence_Occurrences'], [2, 0x2C, 'Interval', 'Recurrence_Interval'],
  [2, 0x2D, 'DayOfWeek', 'Recurrence_DayOfWeek'], [2, 0x2E, 'DayOfMonth', 'Recurrence_DayOfMonth'],
  [2, 0x2F, 'WeekOfMonth', 'Recurrence_WeekOfMonth'], [2, 0x30, 'MonthOfYear', 'Recurrence_MonthOfYear'],
  [4, 0x05, 'Timezone', 'TimeZone'],
  [24, 0x18, 'RemoveRightsManagementProtection', 'RemoveRightsManagementDistribution'],
];

test('the 12 renamed names are current, and the stale spellings are gone from their code page', () => {
  assert.equal(renamed.length, 12);
  for (const [page, token, name, stale] of renamed) {
    assert.equal(nameAt(page, token), name, `page ${page} token ${token}`);
    assert.ok(!Object.values(activesync.tagPages[page].tags).includes(stale), stale);
  }
});

// [code page, first token, names...]: tokens the 2009 table lacked (58 in all)
const missing = [
  [0, 0x19, 'Truncation'],
  [4, 0x3C, 'ClientUid'],
  [7, 0x05, 'Folders', 'Folder'],
  [8, 0x10, 'ProposedStartTime', 'ProposedEndTime', 'SendResponse'],
  [9, 0x05, 'Body', 'BodySize', 'BodyTruncated'],
  [14, 0x3B, 'AccountOnlyRemoteWipe'],
  [17, 0x1C, 'Add', 'Delete', 'ClientId', 'Content', 'Location', 'Annotation', 'Street', 'City', 'State', 'Country',
    'PostalCode', 'Latitude', 'Longitude', 'Accuracy', 'Altitude', 'AltitudeAccuracy', 'LocationUri', 'InstanceId'],
  [21, 0x15, 'Forwardees', 'Forwardee', 'Name', 'Email'],
  [22, 0x15, 'IsDraft', 'Bcc', 'Send'],
  [25, 0x05, 'Find', 'SearchId', 'ExecuteSearch', 'MailBoxSearchCriterion', 'Query', 'Status', 'FreeText', 'Options',
    'Range', 'DeepTraversal'],
  [25, 0x11, 'Response', 'Result', 'Properties', 'Preview', 'HasAttachments', 'Total', 'DisplayCc', 'DisplayBcc',
    'GALSearchCriterion'],
  [25, 0x20, 'MaxPictures', 'MaxSize', 'Picture'],
];

test('the 58 previously missing tokens are present, at least one per affected code page', () => {
  let count = 0;
  for (const [page, first, ...names] of missing) {
    names.forEach((name, i) => {
      assert.equal(nameAt(page, first + i), name, `page ${page} token ${first + i}`);
      count += 1;
    });
  }
  assert.equal(count, 58);
});

test('the opaque lists name the byte-array elements', () => {
  const opaque = new Set(pages.flatMap(([, page]) => (page.opaque ?? []).map((name) => `${page.namespace}:${name}`)));
  for (const wanted of ['ComposeMail:Mime', 'Email2:ConversationId', 'Email2:ConversationIndex', 'AirSyncBase:Content']) {
    assert.ok(opaque.has(wanted), wanted);
  }
  assert.ok(opaque.size >= 4);
  for (const [, page] of pages) {
    for (const name of page.opaque ?? []) assert.ok(Object.values(page.tags).includes(name), `${page.namespace}:${name}`);
  }
});

test('MS-ASWBXML section 3: a new-contact Sync response', () => {
  const bytes = hex`
    03 01 6A 00            // WBXML 1.3, unknown public id, UTF-8, no string table
    45                     // Sync, with content
    5C 4F                  // Collections, Collection
    50 03 43 6F 6E 74 61 63 74 73 00 01   // Class "Contacts"
    4B 03 32 00 01         // SyncKey "2"
    52 03 32 00 01         // CollectionId "2"
    4E 03 31 00 01         // Status "1"
    56 47                  // Commands, Add
    4D 03 32 3A 31 00 01   // ServerId "2:1"
    5D                     // ApplicationData
    00 11                  // SWITCH_PAGE 17 (AirSyncBase)
    4A 46 03 31 00 01      // Body, Type "1"
    4C 03 30 00 01         // EstimatedDataSize "0"
    4D 03 31 00 01         // Truncated "1"
    01                     // END Body
    00 01                  // SWITCH_PAGE 1 (Contacts)
    5E 03 46 75 6E 6B 2C 20 44 6F 6E 00 01   // FileAs "Funk, Don"
    5F 03 44 6F 6E 00 01   // FirstName "Don"
    69 03 46 75 6E 6B 00 01   // LastName "Funk"
    00 11                  // SWITCH_PAGE 17 (AirSyncBase)
    56 03 31 00 01         // NativeBodyType "1"
    01 01 01 01 01 01      // END ApplicationData, Add, Commands, Collection, Collections, Sync
  `;
  const expected = {
    type: 'document',
    version: '1.3',
    publicId: 1,
    charset: 106,
    children: [el('AirSync', 'Sync', el('AirSync', 'Collections', el('AirSync', 'Collection',
      leaf('AirSync', 'Class', 'Contacts'),
      leaf('AirSync', 'SyncKey', '2'),
      leaf('AirSync', 'CollectionId', '2'),
      leaf('AirSync', 'Status', '1'),
      el('AirSync', 'Commands', el('AirSync', 'Add',
        leaf('AirSync', 'ServerId', '2:1'),
        el('AirSync', 'ApplicationData',
          el('AirSyncBase', 'Body',
            leaf('AirSyncBase', 'Type', '1'),
            leaf('AirSyncBase', 'EstimatedDataSize', '0'),
            leaf('AirSyncBase', 'Truncated', '1')),
          leaf('Contacts', 'FileAs', 'Funk, Don'),
          leaf('Contacts', 'FirstName', 'Don'),
          leaf('Contacts', 'LastName', 'Funk'),
          leaf('AirSyncBase', 'NativeBodyType', '1')))))))],
  };
  assert.deepEqual(decode(bytes, activesync), expected);
  assert.deepEqual(encode(expected, activesync), bytes);
});

for (const name of ['folder-sync-init-request', 'sync-add', 'calendar-item-with-null-body']) {
  test(`fixture ${name}: decodes to the expected Document and re-encodes byte for byte`, () => {
    const bytes = new Uint8Array(readFileSync(fixture(`${name}.wbxml`)));
    const expected = JSON.parse(readFileSync(fixture(`${name}.json`), 'utf8'));
    const document = decode(bytes, activesync);
    assert.deepEqual(document, expected);
    assert.deepEqual(encode(document, activesync), bytes);
  });
}

test('the calendar fixture uses the current name Timezone', () => {
  const json = readFileSync(fixture('calendar-item-with-null-body.json'), 'utf8');
  assert.match(json, /"name": "Timezone"/);
  assert.doesNotMatch(json, /TimeZone/);
});

test('property: decode(encode(d)) is d over generated Documents (activesync)', () => {
  checkRoundTrips('activesync', activesync);
});

test('fuzz: mutated activesync fixtures and Documents decode, or throw WbxmlError; what decodes re-encodes and round-trips', () => {
  const rng = prng(1); // a fixed corpus, so that WBXML_SEED=n WBXML_RUNS=1 replays mutation n
  const seeds = [
    ...['folder-sync-init-request', 'sync-add', 'calendar-item-with-null-body'].map((name) => new Uint8Array(readFileSync(fixture(`${name}.wbxml`)))),
    ...Array.from({ length: 100 }, () => encode(generateDocument(rng, activesync), activesync)),
  ];
  checkMutants('activesync', [activesync], seeds);
});
