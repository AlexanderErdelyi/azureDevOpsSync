-- Migration: Add support for comments and work item links
-- Version: 1.0.1
-- Date: 2026-02-12

-- ============================================================
-- WORK ITEM COMMENTS TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS synced_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_item_id INTEGER NOT NULL,
  source_comment_id TEXT NOT NULL,
  target_comment_id TEXT,
  comment_text TEXT NOT NULL,
  author TEXT,
  created_at DATETIME NOT NULL,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT DEFAULT 'synced', -- 'synced', 'pending', 'error'
  FOREIGN KEY (synced_item_id) REFERENCES synced_items(id) ON DELETE CASCADE,
  UNIQUE(synced_item_id, source_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_comments_item ON synced_comments(synced_item_id);
CREATE INDEX IF NOT EXISTS idx_synced_comments_status ON synced_comments(sync_status);

-- ============================================================
-- WORK ITEM LINKS TRACKING
-- ============================================================

CREATE TABLE IF NOT EXISTS synced_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_item_id INTEGER NOT NULL,
  link_type TEXT NOT NULL, -- 'parent', 'child', 'related', 'depends-on', etc.
  source_linked_item_id TEXT NOT NULL,
  target_linked_item_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sync_status TEXT DEFAULT 'pending', -- 'synced', 'pending', 'error'
  FOREIGN KEY (synced_item_id) REFERENCES synced_items(id) ON DELETE CASCADE,
  UNIQUE(synced_item_id, link_type, source_linked_item_id)
);

CREATE INDEX IF NOT EXISTS idx_synced_links_item ON synced_links(synced_item_id);
CREATE INDEX IF NOT EXISTS idx_synced_links_status ON synced_links(sync_status);
CREATE INDEX IF NOT EXISTS idx_synced_links_source ON synced_links(source_linked_item_id);

-- ============================================================
-- UPDATE EXISTING TABLES
-- ============================================================

-- Add columns to sync_configs options to track comment and link sync settings
-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- The options JSON field will store: 
-- { 
--   "sync_comments": true/false,
--   "sync_links": true/false,
--   "sync_attachments": true/false (future)
-- }
