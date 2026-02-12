import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  GitMerge,
  Eye,
  EyeOff,
  Layers,
  Clock
} from 'lucide-react';
import { conflictsApi, syncConfigApi } from '../services/api';
import '../pages/Page.css';

const Conflicts = () => {
  const [conflicts, setConflicts] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [statusFilter, setStatusFilter] = useState('unresolved');
  const [loading, setLoading] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [resolutionDetails, setResolutionDetails] = useState(null);
  const [resolveMode, setResolveMode] = useState(null); // 'manual' or 'auto'
  const [manualValue, setManualValue] = useState('');
  const [manualRationale, setManualRationale] = useState('');
  const [autoStrategy, setAutoStrategy] = useState('last-write-wins');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    loadConfigs();
    loadConflicts();
  }, [statusFilter, selectedConfig]);

  const loadConfigs = async () => {
    try {
      const response = await syncConfigApi.getSyncConfigs();
      setConfigs(response.data.configs || []);
    } catch (error) {
      console.error('Failed to load configs:', error);
      setConfigs([]);
    }
  };

  const loadConflicts = async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter };
      if (selectedConfig) {
        params.sync_config_id = selectedConfig;
      }
      
      const response = await conflictsApi.getConflicts(params);
      setConflicts(response.data.conflicts);

      // Load stats if config selected
      if (selectedConfig) {
        const statsResponse = await conflictsApi.getStats(selectedConfig);
        setStats(statsResponse.data);
      }
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewDetails = async (conflict) => {
    try {
      const response = await conflictsApi.getConflict(conflict.id);
      setSelectedConflict(response.data.conflict);
      setResolutionDetails(response.data.resolutions);
      setResolveMode(null);
      setManualValue(conflict.target_value || '');
      setManualRationale('');
    } catch (error) {
      console.error('Failed to load conflict details:', error);
    }
  };

  const handleResolveManually = async () => {
    if (!manualValue.trim()) {
      alert('Please enter a resolved value');
      return;
    }

    try {
      await conflictsApi.resolveManually(
        selectedConflict.id,
        manualValue,
        manualRationale,
        'user'
      );
      
      alert('Conflict resolved successfully');
      setSelectedConflict(null);
      setResolveMode(null);
      loadConflicts();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
      alert('Failed to resolve conflict: ' + error.message);
    }
  };

  const handleResolveAuto = async () => {
    try {
      await conflictsApi.resolveAuto(selectedConflict.id, autoStrategy);
      
      alert(`Conflict resolved using ${autoStrategy} strategy`);
      setSelectedConflict(null);
      setResolveMode(null);
      loadConflicts();
    } catch (error) {
      console.error('Failed to auto-resolve conflict:', error);
      alert('Failed to auto-resolve conflict: ' + error.message);
    }
  };

  const handleIgnore = async (conflictId) => {
    if (!confirm('Are you sure you want to ignore this conflict?')) {
      return;
    }

    try {
      await conflictsApi.ignoreConflict(conflictId);
      alert('Conflict ignored');
      if (selectedConflict?.id === conflictId) {
        setSelectedConflict(null);
      }
      loadConflicts();
    } catch (error) {
      console.error('Failed to ignore conflict:', error);
      alert('Failed to ignore conflict: ' + error.message);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'resolved': return <CheckCircle size={16} className="status-icon success" />;
      case 'ignored': return <EyeOff size={16} className="status-icon muted" />;
      default: return <AlertTriangle size={16} className="status-icon warning" />;
    }
  };

  const getConflictTypeLabel = (type) => {
    switch (type) {
      case 'field_conflict': return 'Field Conflict';
      case 'version_conflict': return 'Version Conflict';
      case 'deletion_conflict': return 'Deletion Conflict';
      default: return type;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Conflict Resolution</h1>
          <p>Manage synchronization conflicts between systems</p>
        </div>
        <button onClick={loadConflicts} className="btn-secondary" disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="page-filters">
        <div className="filter-group">
          <label>Sync Configuration</label>
          <select 
            value={selectedConfig || ''} 
            onChange={(e) => setSelectedConfig(e.target.value || null)}
          >
            <option value="">All Configurations</option>
            {configs.map(config => (
              <option key={config.id} value={config.id}>{config.name}</option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="unresolved">Unresolved</option>
            <option value="resolved">Resolved</option>
            <option value="ignored">Ignored</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Conflicts</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Unresolved</div>
            <div className="stat-value warning">{stats.by_status?.unresolved || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Resolved</div>
            <div className="stat-value success">{stats.by_status?.resolved || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ignored</div>
            <div className="stat-value muted">{stats.by_status?.ignored || 0}</div>
          </div>
        </div>
      )}

      {/* Conflicts List */}
      <div className="conflicts-layout">
        <div className="conflicts-list">
          <h3>Conflicts ({conflicts.length})</h3>
          
          {loading ? (
            <div className="loading">Loading conflicts...</div>
          ) : conflicts.length === 0 ? (
            <div className="empty-state">
              <CheckCircle size={48} />
              <p>No {statusFilter} conflicts found</p>
            </div>
          ) : (
            conflicts.map(conflict => (
              <div 
                key={conflict.id} 
                className={`conflict-card ${selectedConflict?.id === conflict.id ? 'selected' : ''}`}
                onClick={() => viewDetails(conflict)}
              >
                <div className="conflict-header">
                  {getStatusIcon(conflict.status)}
                  <span className="conflict-type">{getConflictTypeLabel(conflict.conflict_type)}</span>
                  <span className="conflict-id">#{conflict.id}</span>
                </div>
                
                <div className="conflict-info">
                  <div className="conflict-field">
                    <strong>Config:</strong> {conflict.config_name}
                  </div>
                  <div className="conflict-field">
                    <strong>Field:</strong> {conflict.field_name || 'Multiple fields'}
                  </div>
                  <div className="conflict-field">
                    <strong>Work Item:</strong> Source #{conflict.source_work_item_id} → Target #{conflict.target_work_item_id || 'N/A'}
                  </div>
                  <div className="conflict-time">
                    <Clock size={12} />
                    {new Date(conflict.detected_at).toLocaleString()}
                  </div>
                </div>

                {conflict.status === 'resolved' && (
                  <div className="resolution-badge">
                    <CheckCircle size={14} />
                    Resolved: {conflict.resolution_strategy}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Conflict Details Panel */}
        {selectedConflict && (
          <div className="conflict-details">
            <div className="details-header">
              <h3>Conflict Details</h3>
              <button 
                className="btn-text" 
                onClick={() => setSelectedConflict(null)}
              >
                <XCircle size={16} />
              </button>
            </div>

            <div className="details-body">
              {/* Conflict Information */}
              <div className="details-section">
                <h4>Information</h4>
                <div className="detail-row">
                  <span className="detail-label">Type:</span>
                  <span>{getConflictTypeLabel(selectedConflict.conflict_type)}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Status:</span>
                  <span className={`status-badge ${selectedConflict.status}`}>
                    {selectedConflict.status}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Field:</span>
                  <span><code>{selectedConflict.field_name || 'N/A'}</code></span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Detected:</span>
                  <span>{new Date(selectedConflict.detected_at).toLocaleString()}</span>
                </div>
              </div>

              {/* Conflicting Values */}
              <div className="details-section">
                <h4>Conflicting Values</h4>
                <div className="value-comparison">
                  <div className="value-box">
                    <div className="value-label">Source Value</div>
                    <div className="value-content">
                      {selectedConflict.source_value || <em>null</em>}
                    </div>
                  </div>
                  <div className="value-arrow">
                    <GitMerge size={20} />
                  </div>
                  <div className="value-box">
                    <div className="value-label">Target Value</div>
                    <div className="value-content">
                      {selectedConflict.target_value || <em>null</em>}
                    </div>
                  </div>
                </div>
                
                {selectedConflict.base_value && (
                  <div className="base-value">
                    <strong>Original Value:</strong>
                    <div className="value-content">{selectedConflict.base_value}</div>
                  </div>
                )}
              </div>

              {/* Resolution Actions (only for unresolved) */}
              {selectedConflict.status === 'unresolved' && (
                <div className="details-section">
                  <h4>Resolve Conflict</h4>
                  
                  {!resolveMode ? (
                    <div className="resolution-options">
                      <button 
                        className="btn-primary"
                        onClick={() => setResolveMode('auto')}
                      >
                        <Layers size={16} />
                        Auto Resolve
                      </button>
                      <button 
                        className="btn-secondary"
                        onClick={() => setResolveMode('manual')}
                      >
                        <Eye size={16} />
                        Manual Resolve
                      </button>
                      <button 
                        className="btn-link"
                        onClick={() => handleIgnore(selectedConflict.id)}
                      >
                        <EyeOff size={16} />
                        Ignore
                      </button>
                    </div>
                  ) : resolveMode === 'manual' ? (
                    <div className="resolution-form">
                      <div className="form-group">
                        <label>Resolved Value *</label>
                        <textarea
                          value={manualValue}
                          onChange={(e) => setManualValue(e.target.value)}
                          rows={4}
                          placeholder="Enter the resolved value..."
                        />
                      </div>
                      <div className="form-group">
                        <label>Rationale</label>
                        <textarea
                          value={manualRationale}
                          onChange={(e) => setManualRationale(e.target.value)}
                          rows={2}
                          placeholder="Explain why you chose this value..."
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn-primary" onClick={handleResolveManually}>
                          <CheckCircle size={16} />
                          Resolve
                        </button>
                        <button className="btn-secondary" onClick={() => setResolveMode(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="resolution-form">
                      <div className="form-group">
                        <label>Resolution Strategy *</label>
                        <select 
                          value={autoStrategy}
                          onChange={(e) => setAutoStrategy(e.target.value)}
                        >
                          <option value="last-write-wins">Last Write Wins</option>
                          <option value="source-priority">Source Priority</option>
                          <option value="target-priority">Target Priority</option>
                          <option value="merge">Merge (if possible)</option>
                        </select>
                        <small>
                          {autoStrategy === 'last-write-wins' && 'Use the most recently modified value'}
                          {autoStrategy === 'source-priority' && 'Always use the source system value'}
                          {autoStrategy === 'target-priority' && 'Always use the target system value'}
                          {autoStrategy === 'merge' && 'Attempt intelligent merge of both values'}
                        </small>
                      </div>
                      <div className="form-actions">
                        <button className="btn-primary" onClick={handleResolveAuto}>
                          <Layers size={16} />
                          Apply Strategy
                        </button>
                        <button className="btn-secondary" onClick={() => setResolveMode(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Resolution History */}
              {resolutionDetails && resolutionDetails.length > 0 && (
                <div className="details-section">
                  <h4>Resolution History</h4>
                  {resolutionDetails.map((resolution, idx) => (
                    <div key={idx} className="resolution-history-item">
                      <div className="resolution-header">
                        <span className="resolution-strategy">{resolution.strategy}</span>
                        <span className="resolution-time">
                          {new Date(resolution.resolved_at).toLocaleString()}
                        </span>
                      </div>
                      {resolution.rationale && (
                        <div className="resolution-rationale">{resolution.rationale}</div>
                      )}
                      <div className="resolution-meta">
                        <span>By: {resolution.resolved_by}</span>
                        {resolution.applied_to_source && <span className="applied-badge">✓ Source</span>}
                        {resolution.applied_to_target && <span className="applied-badge">✓ Target</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Conflicts;
