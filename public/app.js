// DOM Elements
const connectionForm = document.getElementById('connectionForm');
const syncForm = document.getElementById('syncForm');
const resultsDiv = document.getElementById('results');
const resultsContent = document.getElementById('resultsContent');
const loading = document.getElementById('loading');

// Get form values
function getConnectionData() {
    return {
        orgUrl: document.getElementById('orgUrl').value.trim(),
        token: document.getElementById('token').value.trim()
    };
}

function getSyncData() {
    const connectionData = getConnectionData();
    const workItemIdsInput = document.getElementById('workItemIds').value.trim();
    
    return {
        ...connectionData,
        sourceProject: document.getElementById('sourceProject').value.trim(),
        targetProject: document.getElementById('targetProject').value.trim(),
        workItemIds: workItemIdsInput ? workItemIdsInput.split(',').map(id => parseInt(id.trim())) : []
    };
}

// Show/hide loading
function showLoading() {
    loading.style.display = 'flex';
}

function hideLoading() {
    loading.style.display = 'none';
}

// Show results
function showResults(html) {
    resultsContent.innerHTML = html;
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
}

// Test connection
async function testConnection() {
    const data = getConnectionData();
    
    // Check for missing fields and provide specific feedback
    const missing = [];
    if (!data.orgUrl) missing.push('Organization URL');
    if (!data.token) missing.push('Personal Access Token');
    
    if (missing.length > 0) {
        showResults(`
            <div class="alert alert-error">
                ⚠️ Please fill in the following required field(s): ${missing.join(', ')}
            </div>
        `);
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            showResults(`
                <div class="alert alert-success">
                    ✅ Connection successful! You can now sync work items.
                </div>
            `);
        } else {
            showResults(`
                <div class="alert alert-error">
                    ❌ Connection failed: ${result.error}
                </div>
            `);
        }
    } catch (error) {
        showResults(`
            <div class="alert alert-error">
                ❌ Error: ${error.message}
            </div>
        `);
    } finally {
        hideLoading();
    }
}

// Handle sync form submission
syncForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = getSyncData();
    
    // Check for missing fields and provide specific feedback
    const missing = [];
    if (!data.orgUrl) missing.push('Organization URL');
    if (!data.token) missing.push('Personal Access Token');
    if (!data.sourceProject) missing.push('Source Project');
    if (!data.targetProject) missing.push('Target Project');
    
    if (missing.length > 0) {
        showResults(`
            <div class="alert alert-error">
                ⚠️ Please fill in the following required field(s): ${missing.join(', ')}
            </div>
        `);
        return;
    }

    showLoading();

    try {
        const response = await fetch('/api/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (result.success) {
            let html = `
                <div class="alert alert-success">
                    ✅ Successfully synced ${result.synced} work item(s)!
                </div>
            `;

            if (result.results && result.results.length > 0) {
                html += `
                    <table class="results-table">
                        <thead>
                            <tr>
                                <th>Source ID</th>
                                <th>Target ID</th>
                                <th>Title</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                result.results.forEach(item => {
                    html += `
                        <tr>
                            <td>${item.sourceId}</td>
                            <td>${item.targetId}</td>
                            <td>${item.title}</td>
                        </tr>
                    `;
                });

                html += `
                        </tbody>
                    </table>
                `;
            }

            if (result.errors && result.errors.length > 0) {
                html += `
                    <div class="alert alert-error" style="margin-top: 15px;">
                        ⚠️ ${result.errors.length} error(s) occurred during sync:
                        <ul style="margin-top: 10px;">
                `;

                result.errors.forEach(error => {
                    html += `<li>Work Item ${error.workItemId}: ${error.error}</li>`;
                });

                html += `
                        </ul>
                    </div>
                `;
            }

            showResults(html);
        } else {
            showResults(`
                <div class="alert alert-error">
                    ❌ Sync failed: ${result.error}
                </div>
            `);
        }
    } catch (error) {
        showResults(`
            <div class="alert alert-error">
                ❌ Error: ${error.message}
            </div>
        `);
    } finally {
        hideLoading();
    }
});

// Load saved configuration from localStorage
window.addEventListener('DOMContentLoaded', () => {
    const savedOrgUrl = localStorage.getItem('orgUrl');
    if (savedOrgUrl) {
        document.getElementById('orgUrl').value = savedOrgUrl;
    }
});

// Save configuration to localStorage
document.getElementById('orgUrl').addEventListener('change', (e) => {
    localStorage.setItem('orgUrl', e.target.value);
});
