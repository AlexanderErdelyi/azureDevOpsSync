# Test the enhanced field sync functionality

$orgUrl = "https://dev.azure.com/aerdelyi12185"
$pat = $env:AZURE_DEVOPS_PAT

Write-Host "Testing Enhanced Field Sync" -ForegroundColor Green
Write-Host "================================`n"

# Test 1: Connection
Write-Host "1. Testing connection..." -ForegroundColor Yellow
$body = @{
    orgUrl = $orgUrl
    token = $pat
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/test-connection" -Method POST -Body $body -ContentType "application/json"
    Write-Host "   ✓ Connection successful" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Connection failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Get field metadata for Task work item type
Write-Host "`n2. Retrieving field metadata for 'Task' work item type..." -ForegroundColor Yellow
$body = @{
    orgUrl = $orgUrl
    token = $pat
    project = "TestProject"  # Replace with your actual project name
    workItemType = "Task"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/api/work-item-type-fields" -Method POST -Body $body -ContentType "application/json"
    Write-Host "   ✓ Retrieved $($response.fieldCount) fields" -ForegroundColor Green
    Write-Host "   Sample fields:" -ForegroundColor Cyan
    $response.fields.PSObject.Properties | Select-Object -First 5 | ForEach-Object {
        $field = $_.Value
        Write-Host "     - $($field.name) ($($field.referenceName)) [ReadOnly: $($field.readOnly)]"
    }
} catch {
    Write-Host "   ✗ Failed to get field metadata" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    
    # This might fail if the project doesn't exist, which is okay for this test
    if ($_.Exception.Message -like "*TF200016*") {
        Write-Host "   (Project 'TestProject' doesn't exist - update script with actual project name)" -ForegroundColor Yellow
    }
}

# Test 3: Test sync with field validation (requires actual work items)
Write-Host "`n3. Testing sync with field validation..." -ForegroundColor Yellow
Write-Host "   (Skipped - requires actual work items and projects)" -ForegroundColor Gray

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Testing complete!" -ForegroundColor Green
Write-Host "`nTo test field sync with actual data:" -ForegroundColor Cyan
Write-Host "1. Update the script with your actual project name"
Write-Host "2. Create test work items in source project"
Write-Host "3. Use the web interface at http://localhost:3000 to sync"
