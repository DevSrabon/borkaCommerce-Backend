$ErrorActionPreference = "Continue"

$baseUrl = "http://localhost:8080"
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "    TESTING OTP, SOCIAL AUTH & AVATAR UPLOAD     " -ForegroundColor Cyan
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

$randId = Get-Random -Minimum 1000 -Maximum 9999
$testEmail = "layla$randId@example.com"
$testPassword = "Password123!"

# 1. Registration with OTP Generation
$devOtp = $null
try {
    $regBody = @{
        first_name = "Layla"
        last_name = "Al-Maktoum"
        email = $testEmail
        phone = "+971509876543"
        password = $testPassword
    } | ConvertTo-Json

    $regRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/register" -Method Post -ContentType "application/json" -Body $regBody
    Assert-Test ($regRes.requires_otp -eq $true -and $regRes.dev_otp -ne $null) "Registration generated OTP and requires verification"
    $devOtp = $regRes.dev_otp
} catch {
    Assert-Test $false "Registration failed: $_"
}

# 2. Resend OTP
try {
    $resendBody = @{ email = $testEmail } | ConvertTo-Json
    $resendRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/resend-otp" -Method Post -ContentType "application/json" -Body $resendBody
    Assert-Test ($resendRes.dev_otp -ne $null) "Resend OTP successfully generated new code"
    $devOtp = $resendRes.dev_otp
} catch {
    Assert-Test $false "Resend OTP failed: $_"
}

# 3. Invalid OTP Rejection
try {
    $invalidBody = @{ email = $testEmail; otp = "000000" } | ConvertTo-Json
    $invalidRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/verify-otp" -Method Post -ContentType "application/json" -Body $invalidBody
    Assert-Test $false "Invalid OTP was accepted (Expected 400 rejection!)"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Assert-Test ($status -eq 400) "Invalid OTP was rejected with HTTP 400"
}

# 4. Valid OTP Verification & Auto-Login
$userToken = $null
$userId = $null
try {
    $validBody = @{ email = $testEmail; otp = $devOtp } | ConvertTo-Json
    $verifyRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/verify-otp" -Method Post -ContentType "application/json" -Body $validBody
    Assert-Test ($verifyRes.token -ne $null -and $verifyRes.user.email_verified -eq $true) "OTP verified successfully and session token issued"
    $userToken = $verifyRes.token
    $userId = $verifyRes.user.id
} catch {
    Assert-Test $false "Valid OTP verification failed: $_"
}

# 5. Social Config Retrieval
try {
    $socialConfig = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/social-config" -Method Get
    Assert-Test ($socialConfig.google_client_id -ne $null -and $socialConfig.facebook_app_id -ne $null) "Dynamic social credentials config returned"
} catch {
    Assert-Test $false "Social config retrieval failed: $_"
}

# 6. Social Login - Google
$googleToken = $null
try {
    $googleBody = @{
        provider = "google"
        email = "salma.google$randId@example.com"
        name = "Salma Google"
        avatar_url = "https://lh3.googleusercontent.com/mock-avatar.jpg"
        social_id = "google_user_$randId"
    } | ConvertTo-Json

    $googleRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/social-login" -Method Post -ContentType "application/json" -Body $googleBody
    Assert-Test ($googleRes.token -ne $null -and $googleRes.user.email_verified -eq $true) "Google social login created account & issued token"
    $googleToken = $googleRes.token
} catch {
    Assert-Test $false "Google social login failed: $_"
}

# 7. Social Login - Facebook
try {
    $fbBody = @{
        provider = "facebook"
        email = "zeinab.fb$randId@example.com"
        name = "Zeinab Facebook"
        social_id = "fb_user_$randId"
    } | ConvertTo-Json

    $fbRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/social-login" -Method Post -ContentType "application/json" -Body $fbBody
    Assert-Test ($fbRes.token -ne $null -and $fbRes.user.email_verified -eq $true) "Facebook social login created account & issued token"
} catch {
    Assert-Test $false "Facebook social login failed: $_"
}

# 8. User Avatar Image Upload (ONLY File Upload)
try {
    # Create a small valid test PNG in memory
    $testPngBytes = [byte[]]@(
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 
        0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    )
    $tempImagePath = "$PSScriptRoot\temp_test_avatar.png"
    [System.IO.File]::WriteAllBytes($tempImagePath, $testPngBytes)

    # Use curl.exe to upload multipart form-data
    $curlOut = & curl.exe -s -X POST "$baseUrl/ecommerce/auth/avatar" `
        -H "Authorization: Bearer $userToken" `
        -F "avatar=@$tempImagePath;type=image/png"

    $avatarRes = $curlOut | ConvertFrom-Json
    Assert-Test ($avatarRes.avatar_url -like "/uploads/customer/*") "User avatar successfully uploaded from device file ($($avatarRes.avatar_url))"

    if (Test-Path $tempImagePath) { Remove-Item $tempImagePath -Force }
} catch {
    Assert-Test $false "Avatar upload failed: $_"
}

# 9. Verify Avatar appears in /me profile
try {
    $meHeaders = @{ Authorization = "Bearer $userToken" }
    $meRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/me" -Method Get -Headers $meHeaders
    Assert-Test ($meRes.avatar_url -like "/uploads/customer/*") "Updated avatar is persisted and returned in /me profile"
} catch {
    Assert-Test $false "Profile verification failed: $_"
}

Write-Host "=================================================" -ForegroundColor Cyan
$resColor = "Red"
if ($failed -eq 0) { $resColor = "Green" }
Write-Host " RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor $resColor
Write-Host "=================================================" -ForegroundColor Cyan
