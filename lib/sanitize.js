/**
 * Security utilities for Azure DevOps Work Item Sync
 */

/**
 * Sanitize project name for use in WIQL queries
 * Prevents WIQL injection by escaping single quotes (WIQL standard)
 * and validating input format
 * 
 * @param {string} projectName - The project name to sanitize
 * @returns {string} - Sanitized project name
 * @throws {Error} - If project name is invalid
 */
function sanitizeProjectName(projectName) {
  if (!projectName || typeof projectName !== 'string') {
    throw new Error('Project name must be a non-empty string');
  }

  // Trim whitespace
  const trimmed = projectName.trim();

  if (trimmed.length === 0) {
    throw new Error('Project name cannot be empty');
  }

  // Azure DevOps project names can contain letters, numbers, spaces, hyphens, underscores, and periods
  // Length: 1-64 characters
  const validProjectNamePattern = /^[a-zA-Z0-9 ._-]{1,64}$/;
  
  if (!validProjectNamePattern.test(trimmed)) {
    throw new Error('Project name contains invalid characters or exceeds length limit');
  }

  // Escape single quotes for WIQL (standard SQL-style escaping)
  return trimmed.replace(/'/g, "''");
}

/**
 * Validate and sanitize organization URL
 * 
 * @param {string} orgUrl - The organization URL to validate
 * @returns {string} - Validated organization URL
 * @throws {Error} - If organization URL is invalid
 */
function validateOrgUrl(orgUrl) {
  if (!orgUrl || typeof orgUrl !== 'string') {
    throw new Error('Organization URL must be a non-empty string');
  }

  const trimmed = orgUrl.trim();

  // Azure DevOps URLs must match the pattern
  const azureDevOpsPattern = /^https:\/\/dev\.azure\.com\/[a-zA-Z0-9_-]+$/;
  
  if (!azureDevOpsPattern.test(trimmed)) {
    throw new Error('Organization URL must be in the format: https://dev.azure.com/your-organization');
  }

  return trimmed;
}

module.exports = {
  sanitizeProjectName,
  validateOrgUrl
};
