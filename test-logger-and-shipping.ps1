$baseUrl = "http://localhost:8080"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "  TESTING DYNAMIC SHIPPING, LOGGER & SETTINGS   " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

function Assert-Test($condition, $message) {
    if ($condition) {
        Write-Host " [PASS] $message" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host " [FAIL] $message" -ForegroundColor Red
        $script:failed++
    }
}

# 1. Test Dynamic Shipping Calculation Endpoint for Normal Subtotal (< 500)
try {
    $calcNormal = Invoke-RestMethod -Uri "$baseUrl/ecommerce/shipping-calculator?subtotal=200" -Method Get
    Assert-Test ($calcNormal.base_fee -gt 0 -and $calcNormal.final_fee -gt 0 -and $calcNormal.is_free -eq $false) "Standard delivery charge applied for normal subtotal ($($calcNormal.display_text))"
} catch {
    Assert-Test $false "Shipping calculation failed for normal subtotal: $_"
}

# 2. Test Dynamic Free Shipping on Orders >= 500 AED Threshold
try {
    $calcFree = Invoke-RestMethod -Uri "$baseUrl/ecommerce/shipping-calculator?subtotal=550" -Method Get
    Assert-Test ($calcFree.final_fee -eq 0 -and $calcFree.is_free -eq $true -and $calcFree.display_text -eq "FREE") "Delivery charge evaluates to 0 and shows 'FREE' when >= threshold ($($calcFree.applied_rule))"
} catch {
    Assert-Test $false "Free shipping evaluation failed: $_"
}

# 3. Test Tiered Shipping Discount on Orders >= 600 AED (e.g. 30% off delivery)
try {
    # If free threshold is set to 700 to test the 600 discount tier
    $adminLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"password123"}'
    $adminHeaders = @{ "Authorization" = "Bearer $($adminLogin.token)" }

    $patchSettings = @{
        shipping_base_fee = "40"
        free_shipping_threshold = "1000"
        shipping_discount_min_order = "600"
        shipping_discount_type = "PERCENTAGE"
        shipping_discount_value = "30"
    } | ConvertTo-Json

    $updated = Invoke-RestMethod -Uri "$baseUrl/admin/site-settings" -Method Patch -ContentType "application/json" -Headers $adminHeaders -Body $patchSettings
    Assert-Test ($updated.shipping_base_fee -eq "40") "Admin dynamically updated shipping settings in database"

    $calcTiered = Invoke-RestMethod -Uri "$baseUrl/ecommerce/shipping-calculator?subtotal=650" -Method Get
    # 40 - 30% (12) = 28 AED
    Assert-Test ($calcTiered.final_fee -eq 28 -and $calcTiered.discount_amount -eq 12) "Dynamic delivery discount (30% off base 40 AED = 28 AED) applied correctly"
} catch {
    Assert-Test $false "Tiered shipping discount failed: $_"
}

# 4. Reset shipping threshold to 500 AED free
try {
    $resetSettings = @{
        shipping_base_fee = "30"
        free_shipping_threshold = "500"
        shipping_discount_min_order = "600"
        shipping_discount_type = "PERCENTAGE"
        shipping_discount_value = "30"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$baseUrl/admin/site-settings" -Method Patch -ContentType "application/json" -Headers $adminHeaders -Body $resetSettings | Out-Null
    Assert-Test $true "Shipping settings restored to 500 AED free express threshold"
} catch {
    Assert-Test $false "Reset settings failed: $_"
}

# 5. Admin retrieves dynamic site settings (including .env L4-L23 defaults)
try {
    $allSettings = Invoke-RestMethod -Uri "$baseUrl/admin/site-settings" -Method Get -Headers $adminHeaders
    $hasSmtp = $allSettings.SMTP_HOST -ne $null
    $hasStripe = $allSettings.STRIPE_SECRET_KEY -ne $null
    $hasSocial = $allSettings.GOOGLE_CLIENT_ID -ne $null
    Assert-Test ($hasSmtp -and $hasStripe -and $hasSocial) "Admin site settings dynamically include SMTP, Stripe, and Social OAuth keys"
} catch {
    Assert-Test $false "Failed to fetch all settings: $_"
}

# 6. Generate requests to test Logger
try {
    # Generate GET and POST requests
    Invoke-RestMethod -Uri "$baseUrl/ecommerce/promotions/active" -Method Get | Out-Null
    Invoke-RestMethod -Uri "$baseUrl/ecommerce/banners" -Method Get | Out-Null

    # Fetch logs from Logger API
    $logsRes = Invoke-RestMethod -Uri "$baseUrl/admin/logs?limit=10" -Method Get -Headers $adminHeaders
    Assert-Test ($logsRes.items.Count -gt 0 -and $logsRes.items[0].route -ne $null) "Logger recorded HTTP requests with method, route, and status"
} catch {
    Assert-Test $false "Logger retrieval failed: $_"
}

# 7. Test Logger 'Most Expensive' Sorting & Response Time
try {
    $expensiveLogs = Invoke-RestMethod -Uri "$baseUrl/admin/logs?most_expensive=true&limit=5" -Method Get -Headers $adminHeaders
    Assert-Test ($expensiveLogs.items.Count -gt 0 -and $expensiveLogs.items[0].duration_ms -ge 0) "Logger sorts by 'Most Expensive' response duration"
} catch {
    Assert-Test $false "Most expensive logs failed: $_"
}

# 8. Test Logger Search Filter
try {
    $searchLogs = Invoke-RestMethod -Uri "$baseUrl/admin/logs?search=promotions" -Method Get -Headers $adminHeaders
    Assert-Test ($searchLogs.items.Count -ge 1) "Logger search filter matched 'promotions' route"
} catch {
    Assert-Test $false "Logger search filter failed: $_"
}

# 9. Test Logger Analytics Stats
try {
    $stats = Invoke-RestMethod -Uri "$baseUrl/admin/logs/stats" -Method Get -Headers $adminHeaders
    Assert-Test ($stats.totalRequests -ge 1 -and $stats.avgDurationMs -ge 0) "Logger analytics returned total requests ($($stats.totalRequests)) and avg duration ($($stats.avgDurationMs)ms)"
} catch {
    Assert-Test $false "Logger stats failed: $_"
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
