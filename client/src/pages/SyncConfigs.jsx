import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  X, 
  Plus,
  Trash2,
  ArrowRight,
  Settings,
  Filter,
  Zap
} from 'lucide-react';
import { connectorApi, metadataApi, syncConfigApi } from '../services/api';
import './SyncConfigs.css';

const STEPS = [
  { id: 1, title: 'Connectors', description: 'Select source and target' },
  { id: 2, title: 'Work Items', description: 'Configure item types' },
  { id: 3, title: 'Field Mapping', description: 'Map fields' },
  { id: 4, title: 'Filters', description: 'Configure filters' },
  { id: 5, title: 'Settings', description: 'Sync settings' }
];

const TRANSFORMATION_FUNCTIONS = [
  'none', 'trim', 'uppercase', 'lowercase', 'html_to_text', 'text_to_html',
  'date_to_iso', 'iso_to_date', 'priority_map', 'severity_map', 'state_map',
  'concat', 'split', 'replace', 'prefix', 'suffix', 'default_value'
];

const SyncConfigs = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [sourceMetadata, setSourceMetadata] = useState(null);
  const [targetMetadata, setTargetMetadata] = useState(null);

  const [wizardData, setWizardData] = useState({
    name: '',
    source_connector_id: '',
    target_connector_id: '',
    source_work_item_type: '',
    target_work_item_type: '',
    field_mappings: [],
    filter_conditions: [],
    trigger_type: 'manual',
    schedule_cron: '',
    sync_direction: 'one_way',
    is_active: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configsRes, connectorsRes] = await Promise.all([
        syncConfigApi.getSyncConfigs(),
        connectorApi.getConnectors()
      ]);
      setConfigs(configsRes.data.configs || []);
      setConnectors(connectorsRes.data.connectors || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMetadata = async (connectorId, type) => {
    try {
      const res = await metadataApi.getWorkItemTypes(connectorId);
      const types = res.data.work_item_types || [];
      
      // Store full objects so we have both name and ID
      const typeMap = {};
      types.forEach(t => {
        typeMap[t.type_name] = t;
      });
      
      if (type === 'source') {
        setSourceMetadata({ types: Object.keys(typeMap), typeMap, fields: {} });
      } else {
        setTargetMetadata({ types: Object.keys(typeMap), typeMap, fields: {} });
      }
    } catch (error) {
      console.error(`Error loading ${type} metadata:`, error);
    }
  };

  const loadFieldsForType = async (connectorId, workItemTypeName, type) => {
    try {
      // Get the type ID from the type name
      const metadata = type === 'source' ? sourceMetadata : targetMetadata;
      const typeObj = metadata?.typeMap?.[workItemTypeName];
      
      if (!typeObj) {
        console.error(`Type ${workItemTypeName} not found in metadata`);
        return;
      }
      
      const res = await metadataApi.getWorkItemFields(connectorId, typeObj.id);
      const fields = res.data.fields || [];
      
      // Extract field names from field objects
      const fieldNames = fields.map(f => f.field_name);
      
      if (type === 'source') {
        setSourceMetadata(prev => ({
          ...prev,
          fields: { ...prev.fields, [workItemTypeName]: fieldNames }
        }));
      } else {
        setTargetMetadata(prev => ({
          ...prev,
          fields: { ...prev.fields, [workItemTypeName]: fieldNames }
        }));
      }
    } catch (error) {
      console.error(`Error loading fields for ${workItemTypeName}:`, error);
    }
  };

  const handleNext = async () => {
    if (currentStep === 1 && wizardData.source_connector_id && wizardData.target_connector_id) {
      await Promise.all([
        loadMetadata(wizardData.source_connector_id, 'source'),
        loadMetadata(wizardData.target_connector_id, 'target')
      ]);
    }
    
    if (currentStep === 2 && wizardData.source_work_item_type && wizardData.target_work_item_type) {
      await Promise.all([
        loadFieldsForType(wizardData.source_connector_id, wizardData.source_work_item_type, 'source'),
        loadFieldsForType(wizardData.target_connector_id, wizardData.target_work_item_type, 'target')
      ]);
    }
    
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmit = async () => {
    try {
      await syncConfigApi.createSyncConfig(wizardData);
      await loadData();
      setShowWizard(false);
      resetWizard();
    } catch (error) {
      console.error('Error creating sync config:', error);
      alert('Error creating sync config: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSourceMetadata(null);
    setTargetMetadata(null);
    setWizardData({
      name: '',
      source_connector_id: '',
      target_connector_id: '',
      source_work_item_type: '',
      target_work_item_type: '',
      field_mappings: [],
      filter_conditions: [],
      trigger_type: 'manual',
      schedule_cron: '',
      sync_direction: 'one_way',
      is_active: true
    });
  };

  const addFieldMapping = () => {
    setWizardData(prev => ({
      ...prev,
      field_mappings: [...prev.field_mappings, {
        source_field: '',
        target_field: '',
        transformation: 'none',
        is_required: false
      }]
    }));
  };

  const updateFieldMapping = (index, field, value) => {
    setWizardData(prev => ({
      ...prev,
      field_mappings: prev.field_mappings.map((m, i) => 
        i === index ? { ...m, [field]: value } : m
      )
    }));
  };

  const removeFieldMapping = (index) => {
    setWizardData(prev => ({
      ...prev,
      field_mappings: prev.field_mappings.filter((_, i) => i !== index)
    }));
  };

  const deleteConfig = async (id) => {
    if (!confirm('Delete this sync configuration?')) return;
    try {
      await syncConfigApi.deleteSyncConfig(id);
      await loadData();
    } catch (error) {
      console.error('Error deleting config:', error);
      alert('Error deleting config: ' + (error.response?.data?.error || error.message));
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <h1>Sync Configurations</h1>
        </div>
        <div className="loading">Loading configurations...</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Sync Configurations</h1>
          <p className="subtitle">Create and manage sync configurations</p>
        </div>
        {!showWizard && (
          <button className="btn-primary" onClick={() => setShowWizard(true)}>
            <Plus size={16} />
            New Configuration
          </button>
        )}
      </div>

      {showWizard ? (
        <div className="wizard">
          {/* Progress Steps */}
          <div className="wizard-steps">
            {STEPS.map((step, index) => (
              <div key={step.id} className={`wizard-step ${currentStep >= step.id ? 'active' : ''} ${currentStep === step.id ? 'current' : ''}`}>
                <div className="step-number">
                  {currentStep > step.id ? <Check size={16} /> : step.id}
                </div>
                <div className="step-info">
                  <div className="step-title">{step.title}</div>
                  <div className="step-description">{step.description}</div>
                </div>
                {index < STEPS.length - 1 && <ChevronRight className="step-arrow" size={20} />}
              </div>
            ))}
          </div>

          {/* Step Content */}
          <div className="wizard-content">
            {/* Step 1: Connectors */}
            {currentStep === 1 && (
              <div className="wizard-step-content">
                <h2>Select Connectors</h2>
                <p className="step-subtitle">Choose source and target connectors for synchronization</p>
                
                <div className="form-group">
                  <label>Configuration Name *</label>
                  <input
                    type="text"
                    value={wizardData.name}
                    onChange={e => setWizardData({ ...wizardData, name: e.target.value })}
                    placeholder="My Sync Configuration"
                  />
                </div>

                <div className="connector-selection">
                  <div className="connector-box">
                    <label>Source Connector *</label>
                    <select
                      value={wizardData.source_connector_id}
                      onChange={e => setWizardData({ ...wizardData, source_connector_id: e.target.value })}
                    >
                      <option value="">Select source...</option>
                      {connectors.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="connector-arrow">
                    <ArrowRight size={32} />
                  </div>

                  <div className="connector-box">
                    <label>Target Connector *</label>
                    <select
                      value={wizardData.target_connector_id}
                      onChange={e => setWizardData({ ...wizardData, target_connector_id: e.target.value })}
                    >
                      <option value="">Select target...</option>
                      {connectors.filter(c => c.is_active && c.id != wizardData.source_connector_id).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Work Item Types */}
            {currentStep === 2 && (
              <div className="wizard-step-content">
                <h2>Configure Work Item Types</h2>
                <p className="step-subtitle">Select which work item types to synchronize</p>

                <div className="work-item-selection">
                  <div className="work-item-box">
                    <label>Source Work Item Type *</label>
                    <select
                      value={wizardData.source_work_item_type}
                      onChange={e => setWizardData({ ...wizardData, source_work_item_type: e.target.value })}
                    >
                      <option value="">Select type...</option>
                      {(sourceMetadata?.types || []).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="connector-arrow">
                    <ArrowRight size={32} />
                  </div>

                  <div className="work-item-box">
                    <label>Target Work Item Type *</label>
                    <select
                      value={wizardData.target_work_item_type}
                      onChange={e => setWizardData({ ...wizardData, target_work_item_type: e.target.value })}
                    >
                      <option value="">Select type...</option>
                      {(targetMetadata?.types || []).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Field Mappings */}
            {currentStep === 3 && (
              <div className="wizard-step-content">
                <h2>Field Mappings</h2>
                <p className="step-subtitle">Map fields from source to target</p>

                <div className="field-mappings">
                  {wizardData.field_mappings.map((mapping, index) => (
                    <div key={index} className="field-mapping-row">
                      <div className="field-select">
                        <label>Source Field</label>
                        <select
                          value={mapping.source_field}
                          onChange={e => updateFieldMapping(index, 'source_field', e.target.value)}
                        >
                          <option value="">Select field...</option>
                          {(sourceMetadata?.fields[wizardData.source_work_item_type] || []).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div className="mapping-arrow">
                        <ArrowRight size={20} />
                      </div>

                      <div className="field-select">
                        <label>Target Field</label>
                        <select
                          value={mapping.target_field}
                          onChange={e => updateFieldMapping(index, 'target_field', e.target.value)}
                        >
                          <option value="">Select field...</option>
                          {(targetMetadata?.fields[wizardData.target_work_item_type] || []).map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div className="transformation-select">
                        <label>Transformation</label>
                        <select
                          value={mapping.transformation}
                          onChange={e => updateFieldMapping(index, 'transformation', e.target.value)}
                        >
                          {TRANSFORMATION_FUNCTIONS.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        className="btn-icon-danger"
                        onClick={() => removeFieldMapping(index)}
                        title="Remove mapping"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  <button className="btn-secondary" onClick={addFieldMapping}>
                    <Plus size={16} />
                    Add Field Mapping
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Filters */}
            {currentStep === 4 && (
              <div className="wizard-step-content">
                <h2>Filters & Conditions</h2>
                <p className="step-subtitle">Configure optional filters for work items</p>

                <div className="form-group">
                  <label>Filter Query (WIQL)</label>
                  <textarea
                    rows="4"
                    placeholder="Example: [System.State] = 'Active'"
                    value={wizardData.filter_conditions[0]?.query || ''}
                    onChange={e => setWizardData({
                      ...wizardData,
                      filter_conditions: [{ field: 'query', query: e.target.value }]
                    })}
                  />
                  <small className="form-hint">Optional: Filter which work items to sync</small>
                </div>

                <div className="form-group">
                  <label>Sync Direction</label>
                  <select
                    value={wizardData.sync_direction}
                    onChange={e => setWizardData({ ...wizardData, sync_direction: e.target.value })}
                  >
                    <option value="one_way">One-way (Source → Target)</option>
                    <option value="bidirectional">Bidirectional (Source ↔ Target)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 5: Settings */}
            {currentStep === 5 && (
              <div className="wizard-step-content">
                <h2>Sync Settings</h2>
                <p className="step-subtitle">Configure trigger and scheduling options</p>

                <div className="form-group">
                  <label>Trigger Type</label>
                  <select
                    value={wizardData.trigger_type}
                    onChange={e => setWizardData({ ...wizardData, trigger_type: e.target.value })}
                  >
                    <option value="manual">Manual</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="webhook">Webhook</option>
                  </select>
                </div>

                {wizardData.trigger_type === 'scheduled' && (
                  <div className="form-group">
                    <label>Schedule (Cron Expression)</label>
                    <input
                      type="text"
                      value={wizardData.schedule_cron}
                      onChange={e => setWizardData({ ...wizardData, schedule_cron: e.target.value })}
                      placeholder="0 * * * * (every hour)"
                    />
                    <small className="form-hint">
                      Examples: <code>0 * * * *</code> (hourly), <code>0 0 * * *</code> (daily)
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={wizardData.is_active}
                      onChange={e => setWizardData({ ...wizardData, is_active: e.target.checked })}
                    />
                    <span>Enable this configuration</span>
                  </label>
                </div>

                {/* Summary */}
                <div className="config-summary">
                  <h3>Configuration Summary</h3>
                  <div className="summary-grid">
                    <div className="summary-item">
                      <label>Name:</label>
                      <span>{wizardData.name || 'N/A'}</span>
                    </div>
                    <div className="summary-item">
                      <label>Source:</label>
                      <span>{connectors.find(c => c.id == wizardData.source_connector_id)?.name || 'N/A'}</span>
                    </div>
                    <div className="summary-item">
                      <label>Target:</label>
                      <span>{connectors.find(c => c.id == wizardData.target_connector_id)?.name || 'N/A'}</span>
                    </div>
                    <div className="summary-item">
                      <label>Field Mappings:</label>
                      <span>{wizardData.field_mappings.length} mappings</span>
                    </div>
                    <div className="summary-item">
                      <label>Trigger:</label>
                      <span>{wizardData.trigger_type}</span>
                    </div>
                    <div className="summary-item">
                      <label>Status:</label>
                      <span>{wizardData.is_active ? 'Active' : 'Inactive'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wizard Actions */}
          <div className="wizard-actions">
            <button className="btn-secondary" onClick={() => { setShowWizard(false); resetWizard(); }}>
              <X size={16} />
              Cancel
            </button>
            
            <div className="wizard-navigation">
              {currentStep > 1 && (
                <button className="btn-secondary" onClick={handleBack}>
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
              
              {currentStep < STEPS.length ? (
                <button
                  className="btn-primary"
                  onClick={handleNext}
                  disabled={
                    (currentStep === 1 && (!wizardData.name || !wizardData.source_connector_id || !wizardData.target_connector_id)) ||
                    (currentStep === 2 && (!wizardData.source_work_item_type || !wizardData.target_work_item_type))
                  }
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              ) : (
                <button className="btn-primary" onClick={handleSubmit}>
                  <Check size={16} />
                  Create Configuration
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="configs-list">
          {configs.length === 0 ? (
            <div className="empty-state">
              <Settings size={48} className="empty-icon" />
              <p>No sync configurations yet</p>
              <button className="btn-primary" onClick={() => setShowWizard(true)}>
                <Plus size={16} />
                Create First Configuration
              </button>
            </div>
          ) : (
            <div className="config-cards">
              {configs.map(config => (
                <div key={config.id} className={`config-card ${config.is_active ? 'active' : 'inactive'}`}>
                  <div className="config-card-header">
                    <h3>{config.name}</h3>
                    <span className={`status-badge ${config.is_active ? 'active' : 'inactive'}`}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="config-card-body">
                    <div className="config-flow">
                      <div className="flow-item">
                        <label>Source</label>
                        <span>{config.source_connector_name || `Connector ${config.source_connector_id}`}</span>
                        <small>{config.source_work_item_type}</small>
                      </div>
                      <ArrowRight size={24} className="flow-arrow" />
                      <div className="flow-item">
                        <label>Target</label>
                        <span>{config.target_connector_name|| `Connector ${config.target_connector_id}`}</span>
                        <small>{config.target_work_item_type}</small>
                      </div>
                    </div>

                    <div className="config-meta">
                      <div className="meta-item">
                        <Zap size={14} />
                        <span>{config.trigger_type}</span>
                      </div>
                      {config.schedule_cron && (
                        <div className="meta-item">
                          <Filter size={14} />
                          <code>{config.schedule_cron}</code>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="config-card-actions">
                    <button className="btn-icon-action danger" onClick={() => deleteConfig(config.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SyncConfigs;
