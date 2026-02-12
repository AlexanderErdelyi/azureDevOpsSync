/**
 * Field Configuration for Work Item Synchronization
 * 
 * This module defines which fields should be excluded from sync and provides
 * field mapping capabilities between source and target projects.
 */

// System fields that are read-only and should never be synced
const READONLY_SYSTEM_FIELDS = [
  'System.Id',
  'System.Rev',
  'System.RevisedDate',
  'System.CreatedDate',
  'System.CreatedBy',
  'System.ChangedDate',
  'System.ChangedBy',
  'System.AuthorizedAs',
  'System.AuthorizedDate',
  'System.Watermark',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.BoardLane',
  'System.CommentCount',
  'System.ExternalLinkCount',
  'System.HyperLinkCount',
  'System.RelatedLinkCount',
  'System.RemoteLinkCount',
  'System.AttachedFileCount',
];

// Fields that need special handling or transformation
const SPECIAL_HANDLING_FIELDS = [
  'System.AreaPath',      // Should be updated to target project
  'System.IterationPath', // Should be updated to target project
  'System.TeamProject',   // Should be updated to target project
];

// Default fields to exclude from sync (can be overridden)
const DEFAULT_EXCLUDED_FIELDS = [
  ...READONLY_SYSTEM_FIELDS,
  'System.History', // History is added separately during activity registration
];

/**
 * Determines if a field should be synced
 * @param {string} fieldName - The field reference name
 * @param {Array<string>} customExclusions - Additional fields to exclude
 * @param {Object} fieldMetadata - Optional field metadata from target project
 * @returns {Object} { shouldSync: boolean, reason: string }
 */
function shouldSyncField(fieldName, customExclusions = [], fieldMetadata = null) {
  // Always exclude System.History - it's managed separately for activity registration
  if (fieldName === 'System.History') {
    return { shouldSync: false, reason: 'managed by activity registration' };
  }
  
  // Check if field is in readonly list
  if (READONLY_SYSTEM_FIELDS.includes(fieldName)) {
    return { shouldSync: false, reason: 'read-only system field' };
  }
  
  // Check custom exclusions
  if (customExclusions.includes(fieldName)) {
    return { shouldSync: false, reason: 'custom exclusion' };
  }
  
  // If we have field metadata, use it to validate
  if (fieldMetadata) {
    const metadata = fieldMetadata[fieldName];
    
    // Field doesn't exist in target
    if (!metadata) {
      return { shouldSync: false, reason: 'field does not exist in target' };
    }
    
    // Field is read-only in target
    if (metadata.readOnly) {
      return { shouldSync: false, reason: 'field is read-only in target' };
    }
  }
  
  // Sync all other fields
  return { shouldSync: true, reason: null };
}

/**
 * Maps field values from source to target project
 * @param {string} fieldName - The field reference name
 * @param {any} fieldValue - The field value
 * @param {string} sourceProject - Source project name
 * @param {string} targetProject - Target project name
 * @param {Object} customMappings - Custom field mappings
 * @returns {any} Mapped field value
 */
function mapFieldValue(fieldName, fieldValue, sourceProject, targetProject, customMappings = {}) {
  // Apply custom mappings if provided
  if (customMappings[fieldName]) {
    if (typeof customMappings[fieldName] === 'function') {
      return customMappings[fieldName](fieldValue, sourceProject, targetProject);
    }
    return customMappings[fieldName];
  }
  
  // Handle area path - replace source project with target project
  if (fieldName === 'System.AreaPath') {
    if (fieldValue && fieldValue.startsWith(sourceProject)) {
      return fieldValue.replace(sourceProject, targetProject);
    }
    return targetProject;
  }
  
  // Handle iteration path - replace source project with target project
  if (fieldName === 'System.IterationPath') {
    if (fieldValue && fieldValue.startsWith(sourceProject)) {
      return fieldValue.replace(sourceProject, targetProject);
    }
    return targetProject;
  }
  
  // Return value as-is for other fields
  return fieldValue;
}

/**
 * Prepares fields for synchronization
 * @param {Object} sourceFields - Source work item fields
 * @param {string} sourceProject - Source project name
 * @param {string} targetProject - Target project name
 * @param {Object} options - Sync options
 * @returns {Object} Fields ready for sync
 */
function prepareFieldsForSync(sourceFields, sourceProject, targetProject, options = {}) {
  const {
    excludedFields = [],
    customMappings = {},
    includeAllFields = true,
    targetFieldMetadata = null,
    onFieldSkipped = null,
  } = options;
  
  const targetFields = {};
  
  for (const [fieldName, fieldValue] of Object.entries(sourceFields)) {
    // Check if field should be synced
    const syncCheck = shouldSyncField(fieldName, excludedFields, targetFieldMetadata);
    if (!syncCheck.shouldSync) {
      if (onFieldSkipped) {
        onFieldSkipped(fieldName, syncCheck.reason);
      }
      continue;
    }
    
    // Skip null or undefined values
    if (fieldValue === null || fieldValue === undefined) {
      continue;
    }
    
    // Map the field value
    const mappedValue = mapFieldValue(
      fieldName,
      fieldValue,
      sourceProject,
      targetProject,
      customMappings
    );
    
    targetFields[fieldName] = mappedValue;
  }
  
  return targetFields;
}

module.exports = {
  READONLY_SYSTEM_FIELDS,
  SPECIAL_HANDLING_FIELDS,
  DEFAULT_EXCLUDED_FIELDS,
  shouldSyncField,
  mapFieldValue,
  prepareFieldsForSync,
};
