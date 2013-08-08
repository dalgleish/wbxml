var codepages = [

// Code Page 0: AirSync
{
    0x05: 'Sync',
    0x06: 'Responses',
    0x07: 'Add',
    0x08: 'Change',
    0x09: 'Delete',
    0x0A: 'Fetch',
    0x0B: 'SyncKey',
    0x0C: 'ClientId',
    0x0D: 'ServerId',
    0x0E: 'Status',
    0x0F: 'Collection',
    0x10: 'Class',
    0x12: 'CollectionId',
    0x13: 'GetChanges',
    0x14: 'MoreAvailable',
    0x15: 'WindowSize',
    0x16: 'Commands',
    0x17: 'Options',
    0x18: 'FilterType',
    0x1B: 'Conflict',
    0x1C: 'Collections',
    0x1D: 'ApplicationData',
    0x1E: 'DeletesAsMoves',
    0x20: 'Supported',
    0x21: 'SoftDelete',
    0x22: 'MIMESupport',
    0x23: 'MIMETruncation',
    0x24: 'Wait',
    0x25: 'Limit',
    0x26: 'Partial',
    0x27: 'ConversationMode',
    0x28: 'MaxItems',
    0x29: 'HeartbeatInterval'
},
// Code Page 1: Contacts (Not Implemented)
{},
// Code Page 2: Email (Not Implemented)
{},
// Code Page 3: AirNotify (WBXML code page 3 is no longer in use)
{},
// Code Page 4: Calendar (Not Implemented)
{},
// Code Page 5: Move
{
    0x05: 'MoveItems',
    0x06: 'Move',
    0x07: 'SrcMsgId',
    0x08: 'SrcFldId',
    0x09: 'DstFldId',
    0x0A: 'Response',
    0x0B: 'Status',
    0x0C: 'DstMsgId'
},
// Code Page 6: GetItemEstimate
{
    0x05: 'GetItemEstimate',
    0x06: 'Version',
    0x07: 'Collections',
    0x08: 'Collection',
    0x09: 'Class',
    0x0A: 'CollectionId',
    0x0B: 'DateTime',
    0x0C: 'Estimate',
    0x0D: 'Response',
    0x0E: 'Status'
},
// Code Page 7: FolderHierarchy
{
    0x07: 'DisplayName',
    0x08: 'ServerId',
    0x09: 'ParentId',
    0x0A: 'Type',
    0x0C: 'Status',
    0x0E: 'Changes',
    0x0F: 'Add',
    0x10: 'Delete',
    0x11: 'Update',
    0x12: 'SyncKey',
    0x13: 'FolderCreate',
    0x14: 'FolderDelete',
    0x15: 'FolderUpdate',
    0x16: 'FolderSync',
    0x17: 'Count'
},
// Code Page 8: MeetingResponse (Not Implemented)
{},
// Code Page 9: Tasks
{
    0x08: 'Categories',
    0x09: 'Category',
    0x0A: 'Complete',
    0x0B: 'DateCompleted',
    0x0C: 'DueDate',
    0x0D: 'UtcDueDate',
    0x0E: 'Importance',
    0x0F: 'Recurrence',
    0x10: 'Type',
    0x11: 'Start',
    0x12: 'Until',
    0x13: 'Occurrences',
    0x14: 'Interval',
    0x15: 'DayOfMonth',
    0x16: 'DayOfWeek',
    0x17: 'WeekOfMonth',
    0x18: 'MonthOfYear',
    0x19: 'Regenerate',
    0x1A: 'DeadOccur',
    0x1B: 'ReminderSet',
    0x1C: 'ReminderTime',
    0x1D: 'Sensitivity',
    0x1E: 'StartDate',
    0x1F: 'UtcStartDate',
    0x20: 'Subject',
    0x22: 'OrdinalDate',
    0x23: 'SubOrdinalDate',
    0x24: 'CalendarType',
    0x25: 'IsLeapMonth',
    0x26: 'FirstDayOfWeek'
},
// Code Page 10: ResolveRecipients (Not Implemented)
{},
// Code Page 11: ValidateCert (Not Implemented)
{},
// Code Page 12: Contacts2 (Not Implemented)
{},
// Code Page 13: Ping
{
    0x05: 'Ping',
    0x06: 'AutdState',
    //(Not used)
    0x07: 'Status',
    0x08: 'HeartbeatInterval',
    0x09: 'Folders',
    0x0A: 'Folder',
    0x0B: 'Id',
    0x0C: 'Class',
    0x0D: 'MaxFolders'
},
// Code Page 14: Provision (Not Used)
{
    0x05: 'Provision',
    0x06: 'Policies',
    0x07: 'Policy',
    0x08: 'PolicyType',
    0x09: 'PolicyKey',
    0x0A: 'Data',
    0x0B: 'Status',
    0x0C: 'RemoteWipe',
    0x0D: 'EASProvisionDoc',
    0x0E: 'DevicePasswordEnabled',
    0x0F: 'AlphanumericDevicePasswordRequired',
    0x10: 'DeviceEncryptionEnabled',
    0x10: 'RequireStorageCardEncryption',
    0x11: 'PasswordRecoveryEnabled',
    0x13: 'AttachmentsEnabled',
    0x14: 'MinDevicePasswordLength',
    0x15: 'MaxInactivityTimeDeviceLock',
    0x16: 'MaxDevicePasswordFailedAttempts',
    0x17: 'MaxAttachmentSize',
    0x18: 'AllowSimpleDevicePassword',
    0x19: 'DevicePasswordExpiration',
    0x1A: 'DevicePasswordHistory',
    0x1B: 'AllowStorageCard',
    0x1C: 'AllowCamera',
    0x1D: 'RequireDeviceEncryption',
    0x1E: 'AllowUnsignedApplications',
    0x1F: 'AllowUnsignedInstallationPackages',
    0x20: 'MinDevicePasswordComplexCharacters',
    0x21: 'AllowWiFi',
    0x22: 'AllowTextMessaging',
    0x23: 'AllowPOPIMAPEmail',
    0x24: 'AllowBluetooth',
    0x25: 'AllowIrDA',
    0x26: 'RequireManualSyncWhenRoaming',
    0x27: 'AllowDesktopSync',
    0x28: 'MaxCalendarAgeFilter',
    0x29: 'AllowHTMLEmail',
    0x2A: 'MaxEmailAgeFilter',
    0x2B: 'MaxEmailBodyTruncationSize',
    0x2C: 'MaxEmailHTMLBodyTruncationSize',
    0x2D: 'RequireSignedSMIMEMessages',
    0x2E: 'RequireEncryptedSMIMEMessages',
    0x2F: 'RequireSignedSMIMEAlgorithm',
    0x30: 'RequireEncryptionSMIMEAlgorithm',
    0x31: 'AllowSMIMEEncryptionAlgorithmNegotiation',
    0x32: 'AllowSMIMESoftCerts',
    0x33: 'AllowBrowser',
    0x34: 'AllowConsumerEmail',
    0x35: 'AllowRemoteDesktop',
    0x36: 'AllowInternetSharing',
    0x37: 'UnapprovedInROMApplicationList',
    0x38: 'ApplicationName',
    0x39: 'ApprovedApplicationList',
    0x3A: 'Hash'
},
// Code Page 15: Search (Not Implemented)
{},
// Code Page 16: GAL (Not Implemented)
{},
// Code Page 17: AirSyncBase
{
    0x05: 'BodyPreference',
    0x06: 'Type',
    0x07: 'TruncationSize',
    0x08: 'AllOrNone',
    0x0A: 'Body',
    0x0B: 'Data',
    0x0C: 'EstimatedDataSize',
    0x0D: 'Truncated',
    0x0E: 'Attachments',
    0x0F: 'Attachment',
    0x10: 'DisplayName',
    0x11: 'FileReference',
    0x12: 'Method',
    0x13: 'ContentId',
    0x14: 'ContentLocation',
    0x15: 'IsInline',
    0x16: 'NativeBodyType',
    0x17: 'ContentType',
    0x18: 'Preview',
    0x19: 'BodyPartPreference',
    0x1A: 'BodyPart',
    0x1B: 'Status'
},
// Code Page 18: Settings
{
    0x05: 'Settings',
    0x06: 'Status',
    0x07: 'Get',
    0x08: 'Set',
    0x09: 'Oof',
    0x0A: 'OofState',
    0x0B: 'StartTime',
    0x0C: 'EndTime',
    0x0D: 'OofMessage',
    0x0E: 'AppliesToInternal',
    0x0F: 'AppliesToExternalKnown',
    0x10: 'AppliesToExternalUnknown',
    0x11: 'Enabled',
    0x12: 'ReplyMessage',
    0x13: 'BodyType',
    0x14: 'DevicePassword',
    0x15: 'Password',
    0x16: 'DeviceInformation',
    0x17: 'Model',
    0x18: 'IMEI',
    0x19: 'FriendlyName',
    0x1A: 'OS',
    0x1B: 'OSLanguage',
    0x1C: 'PhoneNumber',
    0x1D: 'UserInformation',
    0x1E: 'EmailAddresses',
    0x1F: 'SMTPAddress',
    0x20: 'UserAgent',
    0x21: 'EnableOutboundSMS',
    0x22: 'MobileOperator',
    0x23: 'PrimarySmtpAddress',
    0x24: 'Accounts',
    0x25: 'Account',
    0x26: 'AccountId',
    0x27: 'AccountName',
    0x28: 'UserDisplayName',
    0x29: 'SendDisabled',
    0x2B: 'RightsManagementInformation'
},
// Code Page 19: DocumentLibrary (Not Implemented)
{},
// Code Page 20: ItemOperations
{
    0x05: 'ItemOperations',
    0x06: 'Fetch',
    0x07: 'Store',
    0x08: 'Options',
    0x09: 'Range',
    0x0A: 'Total',
    0x0B: 'Properties',
    0x0C: 'Data',
    0x0D: 'Status',
    0x0E: 'Response',
    0x0F: 'Version',
    0x10: 'Schema',
    0x11: 'Part',
    0x12: 'EmptyFolderContents',
    0x13: 'DeleteSubFolders',
    0x14: 'UserName',
    0x15: 'Password',
    0x16: 'Move',
    0x17: 'DstFldId',
    0x18: 'ConversationId',
    0x19: 'MoveAlways'
},
// Code Page 21: ComposeMail (Not Implemented)
{},
// Code Page 22: Email2 (Not Implemented)
{},
// Code Page 23: Notes (Not Implemented)
{},
// Code Page 24: RightsManagement (Not Implemented)
{}
];

var namespaces = [
  'AirSync',
  'Contacts',
  'Email',
  'AirNotify',
  'Calendar',
  'Move',
  'GetItemEstimate',
  'FolderHierarchy',
  'MeetingResponse',
  'Tasks',
  'ResolveRecipients',
  'ValidateCert',
  'Contacts2',
  'Ping',
  'Provision',
  'Search',
  'Gal',
  'AirSyncBase',
  'Settings',
  'DocumentLibrary',
  'ItemOperations',
  'ComposeMail',
  'Email2',
  'Notes',
  'RightsManagement'
];

function annotate(){
  var page
    , value
    , i;

  // key is radix 16 (hexadecimal)
  var setPageValue = function(key) {
    value = page[key];
    page[value] = parseInt(key, 10);
  };

  for(i = 0; i < codepages.length; i++) {
    page = codepages[i]; // Object
    Object
      .keys(page)// 0x05, 0x06, etc.
      .forEach(setPageValue);
  }
}

annotate();

module.exports.codepages = codepages;
module.exports.namespaces = namespaces;

