$baseUrl = "http://localhost:8080"

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "      TESTING DYNAMIC CMS PAGES & BUILDER API    " -ForegroundColor Cyan
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

# 1. Public fetch seeded about-us page
try {
    $aboutPage = Invoke-RestMethod -Uri "$baseUrl/ecommerce/pages/about-us" -Method Get
    Assert-Test ($aboutPage.slug -eq "about-us" -and $aboutPage.is_published -eq $true) "Storefront can retrieve public 'about-us' page"
} catch {
    Assert-Test $false "Failed to get public about-us: $_"
}

# 2. Public fetch nonexistent page returns 404
try {
    $res = Invoke-RestMethod -Uri "$baseUrl/ecommerce/pages/non-existent-xyz-999" -Method Get
    Assert-Test $false "Expected 404 for nonexistent page"
} catch {
    Assert-Test ($_.Exception.Response.StatusCode.value__ -eq 404) "Storefront receives 404 for non-existent page"
}

# 3. Admin login and fetch pages
$adminToken = $null
try {
    $adminLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"password123"}'
    $adminToken = $adminLogin.token
    $headers = @{ "Authorization" = "Bearer $adminToken" }
    $pages = Invoke-RestMethod -Uri "$baseUrl/admin/pages" -Method Get -Headers $headers
    Assert-Test ($pages.Count -ge 1) "Admin retrieves all CMS pages"
} catch {
    Assert-Test $false "Admin fetch pages failed: $_"
}

# 4. Admin creates new page with drag-and-drop block JSON
$createdPageId = $null
try {
    $headers = @{ "Authorization" = "Bearer $adminToken" }
    $newPagePayload = @{
        title = "Contact Us & Concierge"
        slug = "contact-us"
        content = '[{"id":"b1","type":"HERO","data":{"title":"Get in Touch","subtitle":"We are here for you 24/7"}}]'
        meta_title = "Contact Us | BorkaCommerce"
        meta_description = "Reach out to our customer care team."
        is_published = $true
    } | ConvertTo-Json

    $createdPage = Invoke-RestMethod -Uri "$baseUrl/admin/pages" -Method Post -ContentType "application/json" -Headers $headers -Body $newPagePayload
    $createdPageId = $createdPage.id
    Assert-Test ($createdPage.slug -eq "contact-us" -and $createdPage.id -ne $null) "Admin successfully created new dynamic page 'contact-us'"
} catch {
    Assert-Test $false "Admin create page failed: $_"
}

# 5. Storefront retrieves newly created page
try {
    $publicPage = Invoke-RestMethod -Uri "$baseUrl/ecommerce/pages/contact-us" -Method Get
    Assert-Test ($publicPage.title -eq "Contact Us & Concierge") "Storefront retrieves newly published dynamic page"
} catch {
    Assert-Test $false "Storefront fetch created page failed: $_"
}

# 6. Admin updates page
try {
    $headers = @{ "Authorization" = "Bearer $adminToken" }
    $updatePayload = @{
        title = "Contact Concierge Desk"
    } | ConvertTo-Json

    $updatedPage = Invoke-RestMethod -Uri "$baseUrl/admin/pages/$createdPageId" -Method Patch -ContentType "application/json" -Headers $headers -Body $updatePayload
    Assert-Test ($updatedPage.title -eq "Contact Concierge Desk") "Admin successfully updated dynamic page title"
} catch {
    Assert-Test $false "Admin update page failed: $_"
}

# 7. Admin deletes created page
try {
    $headers = @{ "Authorization" = "Bearer $adminToken" }
    $delRes = Invoke-RestMethod -Uri "$baseUrl/admin/pages/$createdPageId" -Method Delete -Headers $headers
    Assert-Test ($delRes.id -eq $createdPageId) "Admin deleted dynamic page"
} catch {
    Assert-Test $false "Admin delete page failed: $_"
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
