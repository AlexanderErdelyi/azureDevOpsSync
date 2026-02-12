/**
 * Field Mapping Engine
 * Handles transformation and mapping of fields between connectors
 */

const { db } = require('../../database/db');
const transformations = require('./transformations');

class MappingEngine {
  constructor() {
    // Cache for loaded mappings
    this.mappingCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load all mappings for a sync configuration
   * @param {number} syncConfigId - Sync configuration ID
   * @returns {Object} Object containing field, status, and type mappings
   */
  async loadMappings(syncConfigId) {
    const cacheKey = `config_${syncConfigId}`;
    const cached = this.mappingCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp < this.cacheExpiry)) {
      return cached.data;
    }
    
    // Load from database
    const [fieldMappings, statusMappings, typeMappings] = await Promise.all([
      this.loadFieldMappings(syncConfigId),
      this.loadStatusMappings(syncConfigId),
      this.loadTypeMappings(syncConfigId)
    ]);
    
    const mappings = {
      fields: fieldMappings,
      statuses: statusMappings,
      types: typeMappings
    };
    
    // Cache the result
    this.mappingCache.set(cacheKey, {
      data: mappings,
      timestamp: Date.now()
    });
    
    return mappings;
  }

  /**
   * Load field mappings with source and target field metadata
   */
  async loadFieldMappings(syncConfigId) {
    const mappings = await db('sync_field_mappings as fm')
      .select(
        'fm.*',
        'sf.field_name as source_field_name',
        'sf.field_type as source_field_type',
        'sf.field_reference as source_reference_name',
        'tf.field_name as target_field_name',
        'tf.field_type as target_field_type',
        'tf.field_reference as target_reference_name'
      )
      .leftJoin('connector_fields as sf', 'fm.source_field_id', 'sf.id')
      .leftJoin('connector_fields as tf', 'fm.target_field_id', 'tf.id')
      .leftJoin('sync_type_mappings as tm', 'fm.type_mapping_id', 'tm.id')
      .where({ 'tm.sync_config_id': syncConfigId });
    
    return mappings;
  }

  /**
   * Load status mappings with source and target status metadata
   */
  async loadStatusMappings(syncConfigId) {
    const mappings = await db('sync_status_mappings as sm')
      .select(
        'sm.*',
        'ss.status_name as source_status_name',
        'ss.category as source_category',
        'ts.status_name as target_status_name',
        'ts.category as target_category'
      )
      .leftJoin('connector_statuses as ss', 'sm.source_status_id', 'ss.id')
      .leftJoin('connector_statuses as ts', 'sm.target_status_id', 'ts.id')
      .leftJoin('sync_type_mappings as tm', 'sm.type_mapping_id', 'tm.id')
      .where({ 'tm.sync_config_id': syncConfigId });
    
    return mappings;
  }

  /**
   * Load type mappings with source and target type metadata
   */
  async loadTypeMappings(syncConfigId) {
    const mappings = await db('sync_type_mappings as tm')
      .select(
        'tm.*',
        'st.type_name as source_type_name',
        'tt.type_name as target_type_name'
      )
      .leftJoin('connector_work_item_types as st', 'tm.source_type_id', 'st.id')
      .leftJoin('connector_work_item_types as tt', 'tm.target_type_id', 'tt.id')
      .where({ 'tm.sync_config_id': syncConfigId });
    
    return mappings;
  }

  /**
   * Map work item fields from source to target format
   * @param {Object} sourceFields - Source work item fields
   * @param {Object} mappings - Field mappings from loadMappings()
   * @param {Object} context - Additional context (source/target connectors, etc.)
   * @returns {Object} Mapped fields for target connector
   */
  async mapFields(sourceFields, mappings, context = {}) {
    const targetFields = {};
    
    for (const mapping of mappings.fields) {
      try {
        let value = null;
        
        // Determine the value based on mapping type
        switch (mapping.mapping_type) {
          case 'direct':
            // Direct field-to-field mapping
            value = sourceFields[mapping.source_reference_name] || 
                    sourceFields[mapping.source_field_name];
            break;
            
          case 'constant':
            // Constant value
            value = mapping.constant_value;
            break;
            
          case 'transformation':
            // Get source value and apply transformation
            value = sourceFields[mapping.source_reference_name] || 
                    sourceFields[mapping.source_field_name];
            
            if (value != null && mapping.transformation) {
              value = this.applyTransformation(value, mapping.transformation, context);
            }
            break;
            
          case 'computed':
            // Custom computation (future enhancement)
            console.warn(`Computed mapping not yet implemented for field: ${mapping.source_field_name}`);
            continue;
            
          default:
            console.warn(`Unknown mapping type: ${mapping.mapping_type}`);
            continue;
        }
        
        // Set the target field
        if (value != null) {
          const targetKey = mapping.target_reference_name || mapping.target_field_name;
          targetFields[targetKey] = value;
        }
      } catch (error) {
        console.error(`Error mapping field ${mapping.source_field_name}:`, error);
        // Continue with other mappings
      }
    }
    
    return targetFields;
  }

  /**
   * Map a status from source to target
   * @param {string} sourceStatus - Source status name
   * @param {Object} mappings - Status mappings from loadMappings()
   * @returns {string|null} Target status name
   */
  mapStatus(sourceStatus, mappings) {
    if (!sourceStatus) return null;
    
    const mapping = mappings.statuses.find(m => 
      m.source_status_name === sourceStatus
    );
    
    return mapping ? mapping.target_status_name : null;
  }

  /**
   * Map a work item type from source to target
   * @param {string} sourceType - Source work item type name
   * @param {Object} mappings - Type mappings from loadMappings()
   * @returns {string|null} Target work item type name
   */
  mapType(sourceType, mappings) {
    if (!sourceType) return null;
    
    const mapping = mappings.types.find(m => 
      m.source_type_name === sourceType
    );
    
    return mapping ? mapping.target_type_name : null;
  }

  /**
   * Apply a transformation to a value
   * @param {*} value - The input value
   * @param {string|Object} transformation - Transformation name or config
   * @param {Object} context - Additional context for transformations
   * @returns {*} Transformed value
   */
  applyTransformation(value, transformation, context = {}) {
    if (!transformation) return value;
    
    try {
      // Parse transformation if it's a JSON string
      let transformConfig = transformation;
      if (typeof transformation === 'string') {
        try {
          transformConfig = JSON.parse(transformation);
        } catch {
          // Not JSON, treat as simple transformation name
          transformConfig = transformation;
        }
      }
      
      // Apply single transformation
      if (typeof transformConfig === 'string') {
        const fn = transformations.getTransformation(transformConfig);
        if (!fn) {
          throw new Error(`Unknown transformation: ${transformConfig}`);
        }
        return fn(value);
      }
      
      // Apply transformation with arguments
      if (typeof transformConfig === 'object') {
        if (transformConfig.name) {
          const fn = transformations.getTransformation(transformConfig.name);
          if (!fn) {
            throw new Error(`Unknown transformation: ${transformConfig.name}`);
          }
          
          const args = transformConfig.args || [];
          // Replace context placeholders in args
          const resolvedArgs = args.map(arg => {
            if (typeof arg === 'string' && arg.startsWith('$context.')) {
              const contextKey = arg.substring(9);
              return context[contextKey];
            }
            return arg;
          });
          
          return fn(value, ...resolvedArgs);
        }
        
        // Chain of transformations
        if (transformConfig.chain) {
          return transformations.applyChain(value, transformConfig.chain);
        }
      }
      
      throw new Error('Invalid transformation configuration');
    } catch (error) {
      console.error('Transformation error:', error);
      return value; // Return original value on error
    }
  }

  /**
   * Map a complete work item from source to target format
   * @param {Object} sourceWorkItem - Source work item with all fields
   * @param {number} syncConfigId - Sync configuration ID
   * @param {Object} context - Additional context
   * @returns {Object} Mapped work item for target connector
   */
  async mapWorkItem(sourceWorkItem, syncConfigId, context = {}) {
    const mappings = await this.loadMappings(syncConfigId);
    
    const mapped = {
      fields: await this.mapFields(sourceWorkItem.fields || sourceWorkItem, mappings, context),
      type: null,
      status: null
    };
    
    // Map type if present
    if (sourceWorkItem.type) {
      mapped.type = this.mapType(sourceWorkItem.type, mappings);
    }
    
    // Map status if present
    const sourceStatus = sourceWorkItem.status || sourceWorkItem.fields?.['System.State'];
    if (sourceStatus) {
      mapped.status = this.mapStatus(sourceStatus, mappings);
    }
    
    return mapped;
  }

  /**
   * Reverse map: Map fields from target back to source format
   * Useful for bidirectional sync
   */
  async reverseMapFields(targetFields, mappings, context = {}) {
    const sourceFields = {};
    
    for (const mapping of mappings.fields) {
      try {
        const targetKey = mapping.target_reference_name || mapping.target_field_name;
        let value = targetFields[targetKey];
        
        if (value == null) continue;
        
        // For reverse mapping, we generally don't apply transformations
        // unless there's a specific reverse transformation defined
        if (mapping.reverse_transformation) {
          value = this.applyTransformation(value, mapping.reverse_transformation, context);
        }
        
        const sourceKey = mapping.source_reference_name || mapping.source_field_name;
        sourceFields[sourceKey] = value;
      } catch (error) {
        console.error(`Error reverse mapping field ${mapping.target_field_name}:`, error);
      }
    }
    
    return sourceFields;
  }

  /**
   * Clear the mapping cache
   * Call this when mappings are updated
   */
  clearCache(syncConfigId = null) {
    if (syncConfigId) {
      this.mappingCache.delete(`config_${syncConfigId}`);
    } else {
      this.mappingCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.mappingCache.size,
      keys: Array.from(this.mappingCache.keys())
    };
  }

  /**
   * Validate mappings for a sync configuration
   * Returns any issues or warnings
   */
  async validateMappings(syncConfigId) {
    const mappings = await this.loadMappings(syncConfigId);
    const issues = [];
    
    // Check for unmapped required fields
    // Check for type mismatches
    // Check for invalid transformations
    
    for (const fieldMapping of mappings.fields) {
      // Validate transformation exists
      if (fieldMapping.transformation) {
        try {
          const config = JSON.parse(fieldMapping.transformation);
          const name = typeof config === 'string' ? config : config.name;
          
          if (name && !transformations.getTransformation(name)) {
            issues.push({
              type: 'error',
              field: fieldMapping.source_field_name,
              message: `Unknown transformation: ${name}`
            });
          }
        } catch (error) {
          issues.push({
            type: 'error',
            field: fieldMapping.source_field_name,
            message: `Invalid transformation configuration: ${error.message}`
          });
        }
      }
      
      // Check type compatibility
      if (fieldMapping.source_field_type !== fieldMapping.target_field_type &&
          !fieldMapping.transformation) {
        issues.push({
          type: 'warning',
          field: fieldMapping.source_field_name,
          message: `Type mismatch: ${fieldMapping.source_field_type} -> ${fieldMapping.target_field_type}. Consider adding a transformation.`
        });
      }
    }
    
    return {
      valid: issues.filter(i => i.type === 'error').length === 0,
      issues
    };
  }
}

// Export singleton instance
module.exports = new MappingEngine();
