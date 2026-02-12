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
  Zap,
  Edit,
  Play,
  RefreshCw
} from 'lucide-react';
import { connectorApi, metadataApi, syncConfigApi, executeApi } from '../services/api';
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
  const [editingConfigId, setEditingConfigId] = useState(null);
  const [executingConfigId, setExecutingConfigId] = useState(null);

  const [wizardData, setWizardData] = useState({
    name: '',
    source_connector_id: '',
    target_connector_id: '',
    type_mappings: [],
    filter_conditions: [],
    trigger_type: 'manual',
    schedule_cron: '',
    sync_direction: 'one_way',
    is_active: true
  });
  
  const [currentTypeMapping, setCurrentTypeMapping] = useState(null);

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
      const res = await metadataApi.getWorkItemTypes(connectorId, true); // Pass true for enabled_only
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
    try {      if (editingConfigId) {
        await syncConfigApi.updateSyncConfig(editingConfigId, wizardData);
      } else {
        await syncConfigApi.createSyncConfig(wizardData);
      }
      await loadData();
      setShowWizard(false);
      resetWizard();
    } catch (error) {
      console.error('Error saving sync config:', error);
      alert('Error saving sync config: ' + (error.response?.data?.error || error.message));
    }
  };

  const resetWizard = () => {
    setCurrentStep(1);
    setSourceMetadata(null);
    setTargetMetadata(null);
    setEditingConfigId(null);
    setCurrentTypeMapping(null);
    setWizardData({
      name: '',
      source_connector_id: '',
      target_connector_id: '',
      type_mappings: [],
      filter_conditions: [],
      trigger_type: 'manual',
      schedule_cron: '',
      sync_direction: 'one_way',
      is_active: true
    });
  };

  const addTypeMapping = () => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: [...prev.type_mappings, {
        source_type: '',
        target_type: '',
        field_mappings: [],
        status_mappings: []
      }]
    }));
  };

  const updateTypeMapping = (index, field, value) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === index ? { ...tm, [field]: value } : tm
      )
    }));
    
    // Load fields when a type is selected
    if (field === 'source_type' && value) {
      loadFieldsForType(wizardData.source_connector_id, value, 'source');
    } else if (field === 'target_type' && value) {
      loadFieldsForType(wizardData.target_connector_id, value, 'target');
    }
  };

  const removeTypeMapping = (index) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.filter((_, i) => i !== index)
    }));
  };

  const addFieldMapping = (typeMappingIndex) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          field_mappings: [...tm.field_mappings, {
            source_field: '',
            target_field: '',
            transformation: 'none',
            is_required: false
          }]
        } : tm
      )
    }));
  };

  const updateFieldMapping = (typeMappingIndex, fieldIndex, field, value) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          field_mappings: tm.field_mappings.map((fm, j) => 
            j === fieldIndex ? { ...fm, [field]: value } : fm
          )
        } : tm
      )
    }));
  };

  const removeFieldMapping = (typeMappingIndex, fieldIndex) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          field_mappings: tm.field_mappings.filter((_, j) => j !== fieldIndex)
        } : tm
      )
    }));
  };

  const addStatusMapping = (typeMappingIndex) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          status_mappings: [...tm.status_mappings, {
            source_status: '',
            target_status: ''
          }]
        } : tm
      )
    }));
  };

  const updateStatusMapping = (typeMappingIndex, statusIndex, field, value) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          status_mappings: tm.status_mappings.map((sm, j) => 
            j === statusIndex ? { ...sm, [field]: value } : sm
          )
        } : tm
      )
    }));
  };

  const removeStatusMapping = (typeMappingIndex, statusIndex) => {
    setWizardData(prev => ({
      ...prev,
      type_mappings: prev.type_mappings.map((tm, i) => 
        i === typeMappingIndex ? {
          ...tm,
          status_mappings: tm.status_mappings.filter((_, j) => j !== statusIndex)
        } : tm
      )
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

  const editConfig = async (config) => {
    try {
      // Fetch full config details including type mappings, field mappings, and status mappings
      const response = await syncConfigApi.getSyncConfig(config.id);
      const fullConfig = response.data.sync_config;
      
      setEditingConfigId(config.id);
      setCurrentStep(1);
      
      // Load metadata for source and target connectors BEFORE showing wizard
      if (fullConfig.source_connector_id) {
        const sourceTypesRes = await metadataApi.getWorkItemTypes(fullConfig.source_connector_id, true);
        const sourceTypes = sourceTypesRes.data.work_item_types || [];
        const sourceTypeMap = {};
        sourceTypes.forEach(t => { sourceTypeMap[t.type_name] = t; });
        
        // Load fields and statuses for all source types in type_mappings
        const sourceFieldsMap = {};
        const sourceStatusesMap = {};
        for (const tm of fullConfig.type_mappings) {
          if (tm.source_type && sourceTypeMap[tm.source_type]) {
            try {
              const [fieldsRes, statusesRes] = await Promise.all([
                metadataApi.getWorkItemFields(fullConfig.source_connector_id, sourceTypeMap[tm.source_type].id),
                metadataApi.getStatuses(fullConfig.source_connector_id, sourceTypeMap[tm.source_type].id)
              ]);
              
              sourceFieldsMap[tm.source_type] = (fieldsRes.data.fields || []).map(f => f.field_name);
              sourceStatusesMap[tm.source_type] = (statusesRes.data.statuses || []).map(s => s.status_name);
            } catch (err) {
              console.error(`Error loading metadata for source type ${tm.source_type}:`, err);
            }
          }
        }
        
        setSourceMetadata({ 
          types: Object.keys(sourceTypeMap), 
          typeMap: sourceTypeMap, 
          fields: sourceFieldsMap, 
          statuses: sourceStatusesMap 
        });
      }
      
      if (fullConfig.target_connector_id) {
        const targetTypesRes = await metadataApi.getWorkItemTypes(fullConfig.target_connector_id, true);
        const targetTypes = targetTypesRes.data.work_item_types || [];
        const targetTypeMap = {};
        targetTypes.forEach(t => { targetTypeMap[t.type_name] = t; });
        
        // Load fields and statuses for all target types in type_mappings
        const targetFieldsMap = {};
        const targetStatusesMap = {};
        for (const tm of fullConfig.type_mappings) {
          if (tm.target_type && targetTypeMap[tm.target_type]) {
            try {
              const [fieldsRes, statusesRes] = await Promise.all([
                metadataApi.getWorkItemFields(fullConfig.target_connector_id, targetTypeMap[tm.target_type].id),
                metadataApi.getStatuses(fullConfig.target_connector_id, targetTypeMap[tm.target_type].id)
              ]);
              
              targetFieldsMap[tm.target_type] = (fieldsRes.data.fields || []).map(f => f.field_name);
              targetStatusesMap[tm.target_type] = (statusesRes.data.statuses || []).map(s => s.status_name);
            } catch (err) {
              console.error(`Error loading metadata for target type ${tm.target_type}:`, err);
            }
          }
        }
        
        setTargetMetadata({ 
          types: Object.keys(targetTypeMap), 
          typeMap: targetTypeMap, 
          fields: targetFieldsMap, 
          statuses: targetStatusesMap 
        });
      }
      
      // Transform config data to wizard format AFTER metadata is loaded
      setWizardData({
        name: fullConfig.name || '',
        source_connector_id: fullConfig.source_connector_id || '',
        target_connector_id: fullConfig.target_connector_id || '',
        type_mappings: fullConfig.type_mappings || [],
        filter_conditions: [],
        trigger_type: fullConfig.trigger_type || 'manual',
        schedule_cron: fullConfig.schedule_cron || '',
        sync_direction: fullConfig.sync_direction || 'one_way',
        is_active: fullConfig.is_active !== undefined ? fullConfig.is_active : true
      });
      
      // Show wizard LAST, after everything is loaded
      setShowWizard(true);
    } catch (error) {
      console.error('Error loading config for edit:', error);
      alert('Error loading configuration: ' + (error.response?.data?.error || error.message));
    }
  };

  const executeSync = async (configId, configName) => {
    if (!confirm(`Execute sync for "${configName}"?`)) return;
    
    setExecutingConfigId(configId);
    try {
      const result = await executeApi.executeSync(configId);
      
      if (result.data.success) {
        const stats = result.data;
        alert(`✓ Sync completed successfully!\n\nCreated: ${stats.created || 0}\nUpdated: ${stats.updated || 0}\nSkipped: ${stats.skipped || 0}\nErrors: ${stats.errors || 0}`);
        
        // Optionally navigate to monitoring page to see details
        if (stats.executionId) {
          const goToMonitoring = confirm('Would you like to view execution details in Monitoring?');
          if (goToMonitoring) {
            navigate('/monitoring');
          }
        }
      } else {
        alert('✗ Sync failed: ' + (result.data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error executing sync:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Unknown error';
      alert(`✗ Sync execution failed:\n\n${errorMsg}\n\nPlease check:\n- Connectors are active and configured\n- Metadata has been discovered\n- Field mappings are correct`);
    } finally {
      setExecutingConfigId(null);
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
              <div 
                key={step.id} 
                className={`wizard-step ${currentStep >= step.id ? 'active' : ''} ${currentStep === step.id ? 'current' : ''}`}
                onClick={() => {
                  // Allow clicking to navigate to previous steps or current step when editing
                  if (editingConfigId || step.id <= currentStep) {
                    setCurrentStep(step.id);
                  }
                }}
                style={{ cursor: (editingConfigId || step.id <= currentStep) ? 'pointer' : 'default' }}
              >
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
                <p className="step-subtitle">Add one or more work item type mappings</p>

                <div className="type-mappings-list">
                  {wizardData.type_mappings.map((typeMapping, index) => (
                    <div key={index} className="type-mapping-card">
                      <div className="type-mapping-header">
                        <h3>Type Mapping {index + 1}</h3>
                        <button
                          type="button"
                          className="btn-icon-danger"
                          onClick={() => removeTypeMapping(index)}
                          title="Remove mapping"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className="work-item-selection">
                        <div className="work-item-box">
                          <label>Source Work Item Type *</label>
                          <select
                            value={typeMapping.source_type}
                            onChange={e => updateTypeMapping(index, 'source_type', e.target.value)}
                          >
                            <option value="">Select type...</option>
                            {(sourceMetadata?.types || []).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>

                        <div className="connector-arrow">
                          <ArrowRight size={24} />
                        </div>

                        <div className="work-item-box">
                          <label>Target Work Item Type *</label>
                          <select
                            value={typeMapping.target_type}
                            onChange={e => updateTypeMapping(index, 'target_type', e.target.value)}
                          >
                            <option value="">Select type...</option>
                            {(targetMetadata?.types || []).map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addTypeMapping}
                  >
                    <Plus size={16} /> Add Type Mapping
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Field & Status Mappings */}
            {currentStep === 3 && (
              <div className="wizard-step-content">
                <h2>Field & Status Mappings</h2>
                <p className="step-subtitle">Map fields and statuses for each work item type</p>

                <div className="type-mappings-config">
                  {wizardData.type_mappings.map((typeMapping, tmIndex) => (
                    <div key={tmIndex} className="type-mapping-config-card">
                      <h3 className="type-mapping-title">
                        {typeMapping.source_type || 'Unselected'} → {typeMapping.target_type || 'Unselected'}
                      </h3>

                      {/* Field Mappings Section */}
                      <div className="mappings-section">
                        <h4>Field Mappings</h4>
                        <div className="field-mappings">
                          {typeMapping.field_mappings.map((mapping, fmIndex) => (
                            <div key={fmIndex} className="field-mapping-row">
                              <div className="field-select">
                                <label>Source Field</label>
                                <select
                                  value={mapping.source_field}
                                  onChange={e => updateFieldMapping(tmIndex, fmIndex, 'source_field', e.target.value)}
                                >
                                  <option value="">Select field...</option>
                                  {(sourceMetadata?.fields[typeMapping.source_type] || []).map(f => (
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
                                  onChange={e => updateFieldMapping(tmIndex, fmIndex, 'target_field', e.target.value)}
                                >
                                  <option value="">Select field...</option>
                                  {(targetMetadata?.fields[typeMapping.target_type] || []).map(f => (
                                    <option key={f} value={f}>{f}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="transformation-select">
                                <label>Transformation</label>
                                <select
                                  value={mapping.transformation}
                                  onChange={e => updateFieldMapping(tmIndex, fmIndex, 'transformation', e.target.value)}
                                >
                                  {TRANSFORMATION_FUNCTIONS.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              </div>

                              <button
                                className="btn-icon-danger"
                                onClick={() => removeFieldMapping(tmIndex, fmIndex)}
                                title="Remove mapping"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}

                          <button 
                            className="btn-secondary" 
                            onClick={() => addFieldMapping(tmIndex)}
                          >
                            <Plus size={16} />
                            Add Field Mapping
                          </button>
                        </div>
                      </div>

                      {/* Status Mappings Section */}
                      <div className="mappings-section">
                        <h4>Status Mappings</h4>
                        <div className="status-mappings">
                          {typeMapping.status_mappings.map((mapping, smIndex) => (
                            <div key={smIndex} className="status-mapping-row">
                              <div className="status-select">
                                <label>Source Status</label>
                                <select
                                  value={mapping.source_status}
                                  onChange={e => updateStatusMapping(tmIndex, smIndex, 'source_status', e.target.value)}
                                >
                                  <option value="">Select status...</option>
                                  {(sourceMetadata?.statuses[typeMapping.source_type] || []).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="mapping-arrow">
                                <ArrowRight size={20} />
                              </div>

                              <div className="status-select">
                                <label>Target Status</label>
                                <select
                                  value={mapping.target_status}
                                  onChange={e => updateStatusMapping(tmIndex, smIndex, 'target_status', e.target.value)}
                                >
                                  <option value="">Select status...</option>
                                  {(targetMetadata?.statuses[typeMapping.target_type] || []).map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>

                              <button
                                className="btn-icon-danger"
                                onClick={() => removeStatusMapping(tmIndex, smIndex)}
                                title="Remove mapping"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}

                          <button 
                            className="btn-secondary" 
                            onClick={() => addStatusMapping(tmIndex)}
                          >
                            <Plus size={16} />
                            Add Status Mapping
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                      <label>Type Mappings:</label>
                      <span>{wizardData.type_mappings?.length || 0} mappings</span>
                    </div>
                    <div className="summary-item">
                      <label>Field Mappings:</label>
                      <span>
                        {wizardData.type_mappings?.reduce((total, tm) => 
                          total + (tm.field_mappings?.length || 0), 0) || 0} mappings
                      </span>
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
                    (currentStep === 2 && wizardData.type_mappings.length === 0) ||
                    (currentStep === 2 && wizardData.type_mappings.some(tm => !tm.source_type || !tm.target_type))
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
                    <button 
                      className="btn-icon-action primary" 
                      onClick={() => executeSync(config.id, config.name)} 
                      title="Execute Sync"
                      disabled={!config.is_active || executingConfigId === config.id}
                    >
                      {executingConfigId === config.id ? (
                        <RefreshCw size={16} className="spin" />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                    <button className="btn-icon-action" onClick={() => editConfig(config)} title="Edit">
                      <Edit size={16} />
                    </button>
                    <button className="btn-icon-action danger" onClick={() => deleteConfig(config.id)} title="Delete">
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
