$ErrorActionPreference = "Continue"

$baseUrl = "http://localhost:8080"
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "    E2E PRODUCTION API VERIFICATION SUITE       " -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

$passed = 0
$failed = 0

function Assert-Test($condition, $testName) {
    if ($condition) {
        Write-Host " [PASS] $testName" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host " [FAIL] $testName" -ForegroundColor Red
        $script:failed++
    }
}

# 1. Check Active Promotions
try {
    $promos = Invoke-RestMethod -Uri "$baseUrl/ecommerce/promotions/active" -Method Get
    $hasOffers = $promos.offers.Count -ge 1
    $hasCoupons = $promos.coupons.Count -ge 1
    Assert-Test ($hasOffers -and $hasCoupons) "Active promotions returned offers and coupons"
    $welcomePromo = $promos.coupons | Where-Object { $_.code -eq "WELCOME10" }
    Assert-Test ($welcomePromo -ne $null -and $welcomePromo.discount_value -eq 10) "WELCOME10 coupon exists with 10% discount"
} catch {
    Assert-Test $false "Active promotions check failed: $_"
}

# 2. Check Discounted Products & Calculation
try {
    $onSaleProds = Invoke-RestMethod -Uri "$baseUrl/ecommerce/products?on_sale=true" -Method Get
    Assert-Test ($onSaleProds.Count -ge 2) "On-Sale products returned discounted items ($($onSaleProds.Count) items)"
    $hasDiscountData = $false
    foreach ($p in $onSaleProds) {
        if ($p.discount_percentage -gt 0 -or $p.min_price -lt $p.min_original_price) {
            $hasDiscountData = $true
        }
    }
    Assert-Test $hasDiscountData "On-Sale products correctly have calculated discount_percentage and min_original_price"
} catch {
    Assert-Test $false "On-Sale products query failed: $_"
}

# 3. Test Auth - Admin Login
$adminToken = $null
try {
    $adminLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"password123"}'
    $adminToken = $adminLogin.token
    Assert-Test ($adminToken -ne $null -and $adminLogin.user.role -eq "ADMIN") "Admin logged in successfully with ADMIN role"
} catch {
    Assert-Test $false "Admin login failed: $_"
}

# 4. Test Auth - Blocked Customer
try {
    $blockedLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"mariam@example.com","password":"password123"}'
    Assert-Test $false "Blocked customer was able to log in (Expected rejection!)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test ($statusCode -eq 401 -or $statusCode -eq 403) "Blocked customer login was properly rejected with $statusCode"
}

# 5. Test Auth - Verified Customer Login (Fatima)
$customerToken = $null
$customerFatima = $null
try {
    $fatimaLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"fatima@example.com","password":"password123"}'
    $customerToken = $fatimaLogin.token
    $customerFatima = $fatimaLogin.user
    Assert-Test ($customerToken -ne $null -and $fatimaLogin.user.role -eq "CUSTOMER") "Fatima logged in successfully with CUSTOMER role"
} catch {
    Assert-Test $false "Customer login failed: $_"
}

# 6. Admin Route Security Guards
try {
    # Unauthenticated request to /admin/customers
    $unauthRes = Invoke-RestMethod -Uri "$baseUrl/admin/customers" -Method Get
    Assert-Test $false "Unauthenticated request to /admin/customers succeeded (Expected 401!)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test ($statusCode -eq 401) "Unauthenticated request to /admin/customers blocked with 401"
}

try {
    # Customer token request to /admin/customers
    $headers = @{ "Authorization" = "Bearer $customerToken" }
    $forbiddenRes = Invoke-RestMethod -Uri "$baseUrl/admin/customers" -Method Get -Headers $headers
    Assert-Test $false "Customer token accessed /admin/customers (Expected 403!)"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Assert-Test ($statusCode -eq 403) "Customer token to /admin/customers blocked with 403 Forbidden"
}

# 7. Admin Customers Management
try {
    $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
    $customersList = Invoke-RestMethod -Uri "$baseUrl/admin/customers" -Method Get -Headers $adminHeaders
    Assert-Test ($customersList.Count -ge 3) "Admin successfully retrieved customer list ($($customersList.Count) customers)"
    
    # Get Fatima's details (orders + reviews)
    $fatimaDetails = Invoke-RestMethod -Uri "$baseUrl/admin/customers/$($customerFatima.id)" -Method Get -Headers $adminHeaders
    Assert-Test ($fatimaDetails.orders.Count -ge 1) "Admin retrieved Fatima's details with order history ($($fatimaDetails.orders.Count) orders)"
} catch {
    Assert-Test $false "Admin customer management endpoints failed: $_"
}

# 8. Banners API - Hero & Small Size Presets
try {
    $banners = Invoke-RestMethod -Uri "$baseUrl/ecommerce/banners" -Method Get
    $heroBanners = $banners | Where-Object { $_.size_type -eq "HERO" }
    $smallBanners = $banners | Where-Object { $_.size_type -eq "SMALL" }
    Assert-Test ($heroBanners.Count -ge 1 -and $smallBanners.Count -ge 1) "Banners API returns both HERO ($($heroBanners.Count)) and SMALL ($($smallBanners.Count)) banners"
} catch {
    Assert-Test $false "Banners API failed: $_"
}

# 9. Rating & Review System - Verified Buyer Verification
try {
    # Get all products
    $allProds = Invoke-RestMethod -Uri "$baseUrl/ecommerce/products" -Method Get
    # Product Unbought: Festive Sage Green Silk Bisht Abaya (Fatima NEVER bought)
    # Product 2: Luxury Silk Embroidered Abaya (Fatima BOUGHT)
    $prodUnbought = $allProds | Where-Object { $_.slug -eq "festive-sage-green-silk-bisht-abaya" }
    $prod2 = $allProds | Where-Object { $_.slug -eq "luxury-silk-embroidered-abaya" }

    $custHeaders = @{ "Authorization" = "Bearer $customerToken" }

    # Check eligibility for unbought product
    $elig1 = Invoke-RestMethod -Uri "$baseUrl/ecommerce/reviews/can-review/$($prodUnbought.id)" -Method Get -Headers $custHeaders
    Assert-Test ($elig1.can_review -eq $false) "Fatima is correctly NOT eligible to review unbought product ($($prodUnbought.name))"

    # Check eligibility for Product 2 (bought)
    $elig2 = Invoke-RestMethod -Uri "$baseUrl/ecommerce/reviews/can-review/$($prod2.id)" -Method Get -Headers $custHeaders
    Assert-Test ($elig2.can_review -eq $true) "Fatima is correctly eligible to review purchased product ($($prod2.name))"

    # Attempt to submit review for unbought product -> Must fail with 400/403
    try {
        $bodyUnbought = @{
            product_id = $prodUnbought.id
            rating = 5
            title = "Unverified Review Attempt"
            comment = "Should fail"
        } | ConvertTo-Json
        $failPost = Invoke-RestMethod -Uri "$baseUrl/ecommerce/reviews" -Method Post -Headers $custHeaders -ContentType "application/json" -Body $bodyUnbought
        Assert-Test $false "Unverified review submission was accepted (Expected 400/403 rejection!)"
    } catch {
        $statusReview = $_.Exception.Response.StatusCode.value__
        Assert-Test ($statusReview -eq 400 -or $statusReview -eq 403) "Review on unpurchased product was rejected with 400/403 ($statusReview)"
    }

    # Fetch reviews & stats for Product 2
    $reviewsData = Invoke-RestMethod -Uri "$baseUrl/ecommerce/reviews/product/$($prod2.id)" -Method Get
    Assert-Test ($reviewsData.stats.total_reviews -ge 1 -and $reviewsData.stats.average_rating -gt 0) "Product 2 has verified ratings (avg: $($reviewsData.stats.average_rating))"
} catch {
    Assert-Test $false "Review system testing encountered an error: $_"
}

# 10. Admin Review Moderation
try {
    $adminHeaders = @{ "Authorization" = "Bearer $adminToken" }
    $adminReviews = Invoke-RestMethod -Uri "$baseUrl/admin/reviews" -Method Get -Headers $adminHeaders
    Assert-Test ($adminReviews.Count -ge 1) "Admin can fetch all customer reviews for moderation ($($adminReviews.Count) reviews)"
} catch {
    Assert-Test $false "Admin review moderation failed: $_"
}

# 11. Stripe PaymentIntent Creation (Verification of Stripe API version fix)
try {
    # Register a fresh customer for idempotent checkout testing
    $testTs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $freshEmail = "checkout_$testTs@example.com"
    $freshPass = "CheckoutPass123!"
    $regBody = @{ email = $freshEmail; password = $freshPass; first_name = "Checkout"; last_name = "Tester" } | ConvertTo-Json
    $regRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/register" -Method Post -ContentType "application/json" -Body $regBody
    # Verify OTP
    $vBody = @{ email = $freshEmail; otp = $regRes.dev_otp } | ConvertTo-Json
    $vRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/verify-otp" -Method Post -ContentType "application/json" -Body $vBody
    $aishaHeaders = @{ "Authorization" = "Bearer $($vRes.token)" }

    # Get or create an address for customer
    $addressBody = @{
        country = "United Arab Emirates"
        city = "Dubai"
        area = "Downtown"
        street = "Sheikh Zayed Road"
        building = "Burj Crown Tower"
        postal_code = "00000"
        is_default = $true
    } | ConvertTo-Json

    $addressRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/addresses" -Method Post -Headers $aishaHeaders -ContentType "application/json" -Body $addressBody
    $addressId = $addressRes.id

    # Get a variant ID to order from prod2
    $prod2Variant = $prod2.variants[0].id
    $checkoutBody = @{
        address_id = $addressId
        coupon_code = "WELCOME10"
        currency = "AED"
        items = @(
            @{
                variant_id = $prod2Variant
                quantity = 1
            }
        )
    } | ConvertTo-Json -Depth 5

    $orderRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/orders/checkout" -Method Post -Headers $aishaHeaders -ContentType "application/json" -Body $checkoutBody
    Assert-Test ($orderRes.order_id -ne $null -and $orderRes.client_secret -ne $null) "Order created with Stripe PaymentIntent (client_secret: $($orderRes.client_secret.Substring(0, 15))..., Stripe API error RESOLVED)"
} catch {
    Assert-Test $false "Stripe checkout failed: $_"
}

Write-Host "=================================================" -ForegroundColor Cyan
$resColor = "Red"
if ($failed -eq 0) { $resColor = "Green" }
Write-Host " RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor $resColor
Write-Host "=================================================" -ForegroundColor Cyan
