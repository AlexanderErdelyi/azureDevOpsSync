/**
 * Field Transformation Functions
 * Named transformations that can be applied to field values during sync
 */

/**
 * No transformation - pass through value unchanged
 */
function none(value) {
  return value;
}

/**
 * Transform a value to uppercase
 */
function toUpperCase(value) {
  if (value == null) return null;
  return String(value).toUpperCase();
}

/**
 * Transform a value to lowercase
 */
function toLowerCase(value) {
  if (value == null) return null;
  return String(value).toLowerCase();
}

/**
 * Trim whitespace from a string value
 */
function trim(value) {
  if (value == null) return null;
  return String(value).trim();
}

/**
 * Convert a string to a number
 */
function toNumber(value) {
  if (value == null) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * Convert a number to a string
 */
function toString(value) {
  if (value == null) return null;
  return String(value);
}

/**
 * Convert a value to boolean
 */
function toBoolean(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  
  const str = String(value).toLowerCase();
  return str === 'true' || str === '1' || str === 'yes' || str === 'on';
}

/**
 * Format a date to ISO string
 */
function formatDateISO(value) {
  if (value == null) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

/**
 * Format a date to short date string (YYYY-MM-DD)
 */
function formatDateShort(value) {
  if (value == null) return null;
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Extract the username from an email address
 */
function emailToUsername(value) {
  if (value == null) return null;
  const email = String(value);
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.substring(0, atIndex) : email;
}

/**
 * Replace text in a string
 * @param {string} value - The input value
 * @param {string} search - Text to search for
 * @param {string} replacement - Text to replace with
 */
function replace(value, search, replacement) {
  if (value == null) return null;
  return String(value).replace(new RegExp(search, 'g'), replacement);
}

/**
 * Concatenate multiple values with a separator
 * @param {Array} values - Values to concatenate
 * @param {string} separator - Separator string (default: space)
 */
function concat(values, separator = ' ') {
  if (!Array.isArray(values)) return null;
  return values.filter(v => v != null).join(separator);
}

/**
 * Split a string into an array
 * @param {string} value - The input value
 * @param {string} delimiter - Delimiter to split on (default: comma)
 */
function split(value, delimiter = ',') {
  if (value == null) return null;
  return String(value).split(delimiter).map(s => s.trim());
}

/**
 * Get the first N characters from a string
 */
function truncate(value, length) {
  if (value == null) return null;
  const str = String(value);
  return str.length > length ? str.substring(0, length) : str;
}

/**
 * Map Azure DevOps priority (1-4) to text labels
 */
function azurePriorityToText(value) {
  const map = {
    1: 'Critical',
    2: 'High',
    3: 'Medium',
    4: 'Low'
  };
  return map[value] || null;
}

/**
 * Map text priority labels to Azure DevOps numbers (1-4)
 */
function textToAzurePriority(value) {
  if (value == null) return null;
  
  const str = String(value).toLowerCase();
  const map = {
    'critical': 1,
    'urgent': 1,
    'high': 2,
    'medium': 3,
    'normal': 3,
    'low': 4
  };
  
  return map[str] || 3; // Default to Medium
}

/**
 * Map ServiceDesk Plus priority to Azure DevOps
 */
function serviceDeskToAzurePriority(value) {
  if (value == null) return null;
  
  const str = String(value).toLowerCase();
  const map = {
    'urgent': 1,
    'high': 2,
    'normal': 3,
    'low': 4
  };
  
  return map[str] || 3;
}

/**
 * Map Azure DevOps priority to ServiceDesk Plus
 */
function azureToServiceDeskPriority(value) {
  const map = {
    1: 'Urgent',
    2: 'High',
    3: 'Normal',
    4: 'Low'
  };
  return map[value] || 'Normal';
}

/**
 * Remove HTML tags from a string
 */
function stripHtml(value) {
  if (value == null) return null;
  return String(value).replace(/<[^>]*>/g, '');
}

/**
 * Convert plain text to HTML paragraph
 */
function textToHtml(value) {
  if (value == null) return null;
  const text = String(value);
  // Escape HTML entities and wrap in paragraph
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  
  // Convert line breaks to <br> tags
  return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
}

/**
 * Convert markdown to plain text (basic)
 */
function markdownToText(value) {
  if (value == null) return null;
  return String(value)
    .replace(/#+\s/g, '') // Remove headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.+?)\*/g, '$1') // Remove italic
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
    .replace(/`(.+?)`/g, '$1'); // Remove code
}

/**
 * Extract project name from Area Path or Iteration Path
 * Example: "ProjectName\\Area\\SubArea" -> "ProjectName"
 */
function extractProjectFromPath(value) {
  if (value == null) return null;
  const str = String(value);
  const parts = str.split('\\');
  return parts[0] || null;
}

/**
 * Replace project name in Area Path or Iteration Path
 * Example: ("OldProject\\Area", "NewProject") -> "NewProject\\Area"
 */
function replaceProjectInPath(value, newProject) {
  if (value == null) return null;
  const str = String(value);
  const parts = str.split('\\');
  if (parts.length === 0) return newProject;
  
  parts[0] = newProject;
  return parts.join('\\');
}

/**
 * Apply a chain of transformations
 * @param {*} value - The input value
 * @param {Array<string|Object>} transformations - Array of transformation names or {name, args}
 */
function applyChain(value, transformations) {
  if (!Array.isArray(transformations)) {
    throw new Error('transformations must be an array');
  }
  
  let result = value;
  
  for (const transform of transformations) {
    if (typeof transform === 'string') {
      // Simple transformation name
      const fn = TRANSFORMATIONS[transform];
      if (!fn) {
        throw new Error(`Unknown transformation: ${transform}`);
      }
      result = fn(result);
    } else if (typeof transform === 'object' && transform.name) {
      // Transformation with arguments
      const fn = TRANSFORMATIONS[transform.name];
      if (!fn) {
        throw new Error(`Unknown transformation: ${transform.name}`);
      }
      const args = transform.args || [];
      result = fn(result, ...args);
    } else {
      throw new Error('Invalid transformation format');
    }
    
    // If any transformation returns null, stop the chain
    if (result == null) break;
  }
  
  return result;
}

/**
 * Registry of all available transformations
 */
const TRANSFORMATIONS = {
  none,
  toUpperCase,
  toLowerCase,
  trim,
  toNumber,
  toString,
  toBoolean,
  formatDateISO,
  formatDateShort,
  emailToUsername,
  replace,
  concat,
  split,
  truncate,
  azurePriorityToText,
  textToAzurePriority,
  serviceDeskToAzurePriority,
  azureToServiceDeskPriority,
  stripHtml,
  textToHtml,
  markdownToText,
  extractProjectFromPath,
  replaceProjectInPath,
  applyChain
};

/**
 * Get a transformation function by name
 */
function getTransformation(name) {
  return TRANSFORMATIONS[name] || null;
}

/**
 * Get list of all available transformation names
 */
function getAvailableTransformations() {
  return Object.keys(TRANSFORMATIONS);
}

module.exports = {
  ...TRANSFORMATIONS,
  getTransformation,
  getAvailableTransformations
};
