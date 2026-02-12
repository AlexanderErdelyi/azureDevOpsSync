-- Multi-Connector Integration Platform Database Schema
-- Version: 1.0.0
-- Database: SQLite

-- ============================================================
-- CONNECTOR/ENVIRONMENT MANAGEMENT
-- ============================================================

-- Store connection configurations for different systems
CREATE TABLE connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  connector_type TEXT NOT NULL, -- 'azuredevops', 'servicedeskplus', 'jira', etc.
  base_url TEXT NOT NULL,
  endpoint TEXT, -- project name for Azure DevOps, site for ServiceDesk Plus, etc.
  auth_type TEXT NOT NULL, -- 'pat', 'oauth', 'apikey', 'basic'
  encrypted_credentials TEXT NOT NULL, -- encrypted JSON with auth details
  is_active BOOLEAN DEFAULT 1,
  metadata JSON, -- connector-specific configuration
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connectors_type ON connectors(connector_type);
CREATE INDEX idx_connectors_active ON connectors(is_active);

-- ============================================================
-- WORK ITEM TYPE CONFIGURATION
-- ============================================================

-- Store work item types for each connector
CREATE TABLE connector_work_item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connector_id INTEGER NOT NULL,
  type_name TEXT NOT NULL, -- 'User Story', 'Bug', 'Incident', 'Request', etc.
  type_id TEXT, -- system type ID if applicable
  enabled_for_sync BOOLEAN DEFAULT 0,
  metadata JSON, -- connector-specific metadata (color, icon, etc.)
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  UNIQUE(connector_id, type_name)
);

CREATE INDEX idx_work_item_types_connector ON connector_work_item_types(connector_id);
CREATE INDEX idx_work_item_types_enabled ON connector_work_item_types(enabled_for_sync);

-- ============================================================
-- STATUS CONFIGURATION PER WORK ITEM TYPE
-- ============================================================

-- Store statuses for each work item type
CREATE TABLE connector_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_type_id INTEGER NOT NULL,
  status_name TEXT NOT NULL, -- 'New', 'Active', 'In Progress', 'Open', etc.
  status_value TEXT, -- technical value if different from display name
  status_category TEXT, -- 'proposed', 'in_progress', 'completed', 'removed'
  enabled_for_sync BOOLEAN DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_type_id) REFERENCES connector_work_item_types(id) ON DELETE CASCADE,
  UNIQUE(work_item_type_id, status_name)
);

CREATE INDEX idx_statuses_type ON connector_statuses(work_item_type_id);
CREATE INDEX idx_statuses_enabled ON connector_statuses(enabled_for_sync);

-- ============================================================
-- FIELD CONFIGURATION PER WORK ITEM TYPE
-- ============================================================

-- Store fields for each work item type
CREATE TABLE connector_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_type_id INTEGER NOT NULL,
  field_name TEXT NOT NULL, -- 'Title', 'Description', 'Priority', etc.
  field_reference TEXT NOT NULL, -- 'System.Title', 'Microsoft.VSTS.Common.Priority', etc.
  field_type TEXT NOT NULL, -- 'string', 'html', 'int', 'double', 'datetime', 'boolean', 'identity', 'picklist'
  is_required BOOLEAN DEFAULT 0,
  is_readonly BOOLEAN DEFAULT 0,
  enabled_for_sync BOOLEAN DEFAULT 0,
  suggestion_score INTEGER DEFAULT 0, -- 100=strongly recommend, 0=don't recommend
  allowed_values JSON, -- for picklists/enums
  default_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_item_type_id) REFERENCES connector_work_item_types(id) ON DELETE CASCADE,
  UNIQUE(work_item_type_id, field_reference)
);

CREATE INDEX idx_fields_type ON connector_fields(work_item_type_id);
CREATE INDEX idx_fields_enabled ON connector_fields(enabled_for_sync);
CREATE INDEX idx_fields_suggestion ON connector_fields(suggestion_score);

-- ============================================================
-- SYNC CONFIGURATION (PAIRS)
-- ============================================================

-- Define sync relationships between connectors
CREATE TABLE sync_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  source_connector_id INTEGER NOT NULL,
  target_connector_id INTEGER NOT NULL,
  direction TEXT NOT NULL DEFAULT 'one-way', -- 'one-way', 'bidirectional'
  trigger_type TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'scheduled', 'webhook'
  schedule_cron TEXT, -- cron expression for scheduled syncs
  conflict_resolution TEXT DEFAULT 'last-write-wins', -- 'last-write-wins', 'source-priority', 'target-priority', 'manual'
  is_active BOOLEAN DEFAULT 1,
  last_sync_at DATETIME,
  next_sync_at DATETIME,
  sync_filter JSON, -- WIQL/JQL/filter to limit what gets synced
  options JSON, -- additional sync options
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (source_connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  FOREIGN KEY (target_connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  CHECK (source_connector_id != target_connector_id)
);

CREATE INDEX idx_sync_configs_source ON sync_configs(source_connector_id);
CREATE INDEX idx_sync_configs_target ON sync_configs(target_connector_id);
CREATE INDEX idx_sync_configs_active ON sync_configs(is_active);
CREATE INDEX idx_sync_configs_trigger ON sync_configs(trigger_type);

-- ============================================================
-- WORK ITEM TYPE MAPPING PER SYNC CONFIG
-- ============================================================

-- Map work item types between source and target
CREATE TABLE sync_type_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id INTEGER NOT NULL,
  source_type_id INTEGER NOT NULL,
  target_type_id INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_type_id) REFERENCES connector_work_item_types(id) ON DELETE CASCADE,
  FOREIGN KEY (target_type_id) REFERENCES connector_work_item_types(id) ON DELETE CASCADE,
  UNIQUE(sync_config_id, source_type_id)
);

CREATE INDEX idx_type_mappings_config ON sync_type_mappings(sync_config_id);
CREATE INDEX idx_type_mappings_source ON sync_type_mappings(source_type_id);
CREATE INDEX idx_type_mappings_target ON sync_type_mappings(target_type_id);

-- ============================================================
-- STATUS MAPPING PER TYPE MAPPING
-- ============================================================

-- Map statuses between source and target work item types
CREATE TABLE sync_status_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_mapping_id INTEGER NOT NULL,
  source_status_id INTEGER,
  target_status_id INTEGER,
  is_constant BOOLEAN DEFAULT 0,
  constant_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (type_mapping_id) REFERENCES sync_type_mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (source_status_id) REFERENCES connector_statuses(id) ON DELETE CASCADE,
  FOREIGN KEY (target_status_id) REFERENCES connector_statuses(id) ON DELETE CASCADE,
  CHECK ((is_constant = 1 AND constant_value IS NOT NULL) OR (is_constant = 0 AND target_status_id IS NOT NULL))
);

CREATE INDEX idx_status_mappings_type ON sync_status_mappings(type_mapping_id);

-- ============================================================
-- FIELD MAPPING PER TYPE MAPPING
-- ============================================================

-- Map fields between source and target work item types
CREATE TABLE sync_field_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_mapping_id INTEGER NOT NULL,
  source_field_id INTEGER,
  target_field_id INTEGER,
  is_constant BOOLEAN DEFAULT 0,
  constant_value TEXT,
  transformation_function TEXT, -- name of transformation function (e.g., 'toUpperCase', 'mapUser')
  transformation_config JSON, -- configuration for the transformation
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (type_mapping_id) REFERENCES sync_type_mappings(id) ON DELETE CASCADE,
  FOREIGN KEY (source_field_id) REFERENCES connector_fields(id) ON DELETE CASCADE,
  FOREIGN KEY (target_field_id) REFERENCES connector_fields(id) ON DELETE CASCADE,
  CHECK ((is_constant = 1 AND constant_value IS NOT NULL) OR (is_constant = 0 AND target_field_id IS NOT NULL))
);

CREATE INDEX idx_field_mappings_type ON sync_field_mappings(type_mapping_id);
CREATE INDEX idx_field_mappings_active ON sync_field_mappings(is_active);

-- ============================================================
-- SYNC EXECUTION HISTORY
-- ============================================================

-- Log each sync execution
CREATE TABLE sync_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id INTEGER NOT NULL,
  direction TEXT NOT NULL, -- 'source_to_target', 'target_to_source', 'bidirectional'
  trigger TEXT NOT NULL, -- 'manual', 'scheduled', 'webhook'
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'
  items_processed INTEGER DEFAULT 0,
  items_synced INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_created INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  items_skipped INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,
  error_message TEXT,
  execution_log JSON, -- detailed execution log
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_executions_config ON sync_executions(sync_config_id);
CREATE INDEX idx_executions_status ON sync_executions(status);
CREATE INDEX idx_executions_started ON sync_executions(started_at);

-- ============================================================
-- SYNCED ITEM MAPPING (TRACK RELATIONSHIPS)
-- ============================================================

-- Track which items have been synced and their relationships
CREATE TABLE synced_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id INTEGER NOT NULL,
  source_connector_id INTEGER NOT NULL,
  target_connector_id INTEGER NOT NULL,
  source_item_id TEXT NOT NULL,
  target_item_id TEXT NOT NULL,
  source_item_type TEXT NOT NULL,
  target_item_type TEXT NOT NULL,
  first_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sync_count INTEGER DEFAULT 1,
  source_last_modified DATETIME,
  target_last_modified DATETIME,
  last_sync_direction TEXT, -- 'source_to_target', 'target_to_source'
  sync_status TEXT DEFAULT 'active', -- 'active', 'paused', 'error', 'deleted'
  metadata JSON, -- additional tracking metadata
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (source_connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  FOREIGN KEY (target_connector_id) REFERENCES connectors(id) ON DELETE CASCADE,
  UNIQUE(sync_config_id, source_connector_id, source_item_id)
);

CREATE INDEX idx_synced_items_config ON synced_items(sync_config_id);
CREATE INDEX idx_synced_items_source ON synced_items(source_connector_id, source_item_id);
CREATE INDEX idx_synced_items_target ON synced_items(target_connector_id, target_item_id);
CREATE INDEX idx_synced_items_status ON synced_items(sync_status);

-- ============================================================
-- SYNC CONFLICTS (FOR MANUAL RESOLUTION)
-- ============================================================

-- Store conflicts that require manual intervention
CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_execution_id INTEGER NOT NULL,
  synced_item_id INTEGER NOT NULL,
  conflict_type TEXT NOT NULL, -- 'both_modified', 'deleted_source', 'deleted_target', 'type_mismatch'
  source_data JSON NOT NULL,
  target_data JSON NOT NULL,
  resolution TEXT, -- 'use_source', 'use_target', 'merge', 'skip'
  resolved_at DATETIME,
  resolved_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_execution_id) REFERENCES sync_executions(id) ON DELETE CASCADE,
  FOREIGN KEY (synced_item_id) REFERENCES synced_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_conflicts_execution ON sync_conflicts(sync_execution_id);
CREATE INDEX idx_conflicts_unresolved ON sync_conflicts(resolution) WHERE resolution IS NULL;

-- ============================================================
-- SYNC ERROR LOG
-- ============================================================

-- Detailed error log for debugging
CREATE TABLE sync_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_execution_id INTEGER NOT NULL,
  error_type TEXT NOT NULL, -- 'connection', 'authentication', 'validation', 'mapping', 'api', 'unknown'
  error_code TEXT,
  error_message TEXT NOT NULL,
  item_id TEXT,
  item_type TEXT,
  stack_trace TEXT,
  context JSON, -- additional context for debugging
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_execution_id) REFERENCES sync_executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_errors_execution ON sync_errors(sync_execution_id);
CREATE INDEX idx_errors_type ON sync_errors(error_type);

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================

-- Store system-wide settings
CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL DEFAULT 'string', -- 'string', 'int', 'boolean', 'json'
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO system_settings (key, value, value_type, description) VALUES
  ('encryption_key_version', '1', 'int', 'Version of encryption key in use'),
  ('max_concurrent_syncs', '5', 'int', 'Maximum number of syncs that can run simultaneously'),
  ('sync_batch_size', '100', 'int', 'Number of items to process in each batch'),
  ('webhook_secret', '', 'string', 'Secret key for webhook validation'),
  ('log_retention_days', '90', 'int', 'Number of days to retain sync execution logs'),
  ('conflict_resolution_default', 'last-write-wins', 'string', 'Default conflict resolution strategy');

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- Active sync configurations with connector details
CREATE VIEW v_active_sync_configs AS
SELECT 
  sc.id,
  sc.name,
  sc.direction,
  sc.trigger_type,
  sc.is_active,
  sc.last_sync_at,
  src.name as source_name,
  src.connector_type as source_type,
  tgt.name as target_name,
  tgt.connector_type as target_type
FROM sync_configs sc
JOIN connectors src ON sc.source_connector_id = src.id
JOIN connectors tgt ON sc.target_connector_id = tgt.id
WHERE sc.is_active = 1 AND src.is_active = 1 AND tgt.is_active = 1;

-- Sync statistics summary
CREATE VIEW v_sync_statistics AS
SELECT 
  sc.id as sync_config_id,
  sc.name as sync_config_name,
  COUNT(DISTINCT se.id) as total_executions,
  SUM(se.items_synced) as total_items_synced,
  SUM(se.items_failed) as total_items_failed,
  MAX(se.completed_at) as last_successful_sync,
  COUNT(CASE WHEN se.status = 'running' THEN 1 END) as running_syncs
FROM sync_configs sc
LEFT JOIN sync_executions se ON sc.id = se.sync_config_id
GROUP BY sc.id, sc.name;

-- Pending conflicts
CREATE VIEW v_pending_conflicts AS
SELECT 
  sc_conf.id,
  sc_conf.conflict_type,
  sc_conf.created_at,
  sc.name as sync_config_name,
  si.source_item_id,
  si.target_item_id
FROM sync_conflicts sc_conf
JOIN sync_executions se ON sc_conf.sync_execution_id = se.id
JOIN sync_configs sc ON se.sync_config_id = sc.id
JOIN synced_items si ON sc_conf.synced_item_id = si.id
WHERE sc_conf.resolution IS NULL
ORDER BY sc_conf.created_at DESC;

-- ============================================================
-- WEBHOOK MANAGEMENT
-- ============================================================

-- Register webhooks for sync triggers
CREATE TABLE webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sync_config_id INTEGER NOT NULL,
  connector_id INTEGER NOT NULL, -- which connector this webhook is for
  webhook_url TEXT NOT NULL UNIQUE, -- generated URL path
  secret TEXT NOT NULL, -- for signature verification
  is_active BOOLEAN DEFAULT 1,
  event_types JSON, -- array of event types to trigger on
  metadata JSON, -- additional webhook configuration
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_triggered_at DATETIME,
  trigger_count INTEGER DEFAULT 0,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhooks_url ON webhooks(webhook_url);
CREATE INDEX idx_webhooks_config ON webhooks(sync_config_id);
CREATE INDEX idx_webhooks_active ON webhooks(is_active);

-- Log webhook deliveries
CREATE TABLE webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_id INTEGER NOT NULL,
  payload JSON NOT NULL,
  headers JSON,
  signature TEXT,
  signature_valid BOOLEAN,
  status TEXT NOT NULL, -- 'success', 'failed', 'rejected'
  response_code INTEGER,
  error_message TEXT,
  processing_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created ON webhook_deliveries(created_at);

-- ============================================================
-- NOTIFICATION SETTINGS
-- ============================================================

-- Email notification settings for sync events
CREATE TABLE notification_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_config_id INTEGER,
  notification_type TEXT NOT NULL, -- 'email', 'slack', 'teams', 'webhook'
  event_triggers JSON NOT NULL, -- ['sync_completed', 'sync_failed', 'conflict_detected']
  recipients JSON NOT NULL, -- array of email addresses or webhook URLs
  settings JSON, -- additional notification settings
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_config_id) REFERENCES sync_configs(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_settings_config ON notification_settings(sync_config_id);
CREATE INDEX idx_notification_settings_type ON notification_settings(notification_type);
CREATE INDEX idx_notification_settings_active ON notification_settings(is_active);

