$baseUrl = "http://localhost:8080"
$testSessionId = "sess_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "       TESTING CHAT, RATE LIMIT & BOT            " -ForegroundColor Cyan
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

# 1. Initialize session and verify greeting
try {
    $initBody = @{
        session_id = $testSessionId
        customer_name = "Luxury Guest"
    } | ConvertTo-Json

    $sessionRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/chat/session" -Method Post -ContentType "application/json" -Body $initBody
    Assert-Test ($sessionRes.session_id -eq $testSessionId -and $sessionRes.messages.Count -ge 1) "Chat session created and initial BOT welcome message received"
} catch {
    Assert-Test $false "Failed to init chat session: $_"
}

# 2. Customer sends message
try {
    $sendBody = @{
        session_id = $testSessionId
        message = "Do you have express shipping to Dubai?"
        sender_name = "Luxury Guest"
    } | ConvertTo-Json

    $sendRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/chat/message" -Method Post -ContentType "application/json" -Body $sendBody
    Assert-Test ($sendRes.id -ne $null) "Customer message sent successfully"
} catch {
    Assert-Test $false "Failed to send customer message: $_"
}

# 3. Verify Bot auto FAQ guidance triggered
try {
    $msgsRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/chat/messages/$testSessionId" -Method Get
    $botFaq = $msgsRes.messages | Where-Object { $_.sender_type -eq "BOT" -and $_.message -match "Free Express Shipping" }
    Assert-Test ($botFaq -ne $null) "Smart Concierge Bot automatically provided instant shipping FAQ guidance"
} catch {
    Assert-Test $false "Failed to verify Bot FAQ: $_"
}

# 4. Customer sets typing indicator
try {
    $typingBody = @{
        session_id = $testSessionId
        is_typing = $true
    } | ConvertTo-Json
    $typeRes = Invoke-RestMethod -Uri "$baseUrl/ecommerce/chat/typing" -Method Post -ContentType "application/json" -Body $typingBody
    Assert-Test ($typeRes.is_customer_typing -eq $true) "Customer typing state recorded"
} catch {
    Assert-Test $false "Failed to set typing: $_"
}

# 5. Admin retrieves sessions and unread count
try {
    # Login as admin
    $adminLogin = Invoke-RestMethod -Uri "$baseUrl/ecommerce/auth/login" -Method Post -ContentType "application/json" -Body '{"email":"admin@example.com","password":"password123"}'
    $adminHeaders = @{ "Authorization" = "Bearer $($adminLogin.token)" }

    $unreadRes = Invoke-RestMethod -Uri "$baseUrl/admin/chat/unread-count" -Method Get -Headers $adminHeaders
    Assert-Test ($unreadRes.unread_total -ge 1) "Admin unread count endpoint returns active unread messages ($($unreadRes.unread_total))"

    $adminSessions = Invoke-RestMethod -Uri "$baseUrl/admin/chat/sessions" -Method Get -Headers $adminHeaders
    $foundSession = $adminSessions | Where-Object { $_.session_id -eq $testSessionId }
    Assert-Test ($foundSession -ne $null -and $foundSession.unread_admin_count -ge 1) "Admin retrieves session with positive unread counter"
} catch {
    Assert-Test $false "Admin chat fetch failed: $_"
}

# 6. Admin replies to customer
try {
    $replyBody = @{
        session_id = $testSessionId
        message = "Hello! Yes, our express couriers deliver across Dubai within 24 hours."
    } | ConvertTo-Json
    $replyRes = Invoke-RestMethod -Uri "$baseUrl/admin/chat/reply" -Method Post -Headers $adminHeaders -ContentType "application/json" -Body $replyBody
    Assert-Test ($replyRes.id -ne $null -and $replyRes.sender_type -eq "ADMIN") "Admin replied to customer successfully"

    # Mark as read
    $markRes = Invoke-RestMethod -Uri "$baseUrl/admin/chat/mark-read/$testSessionId" -Method Post -Headers $adminHeaders
    Assert-Test ($markRes.unread_admin_count -eq 0) "Admin marked session as read and reset unread count to 0"
} catch {
    Assert-Test $false "Admin reply failed: $_"
}

# 7. Session-based Rate Limiter Verification (attempt to send 12 messages rapidly)
$rateLimited = $false
try {
    for ($i = 1; $i -le 12; $i++) {
        $spamBody = @{
            session_id = $testSessionId
            message = "Spam test message $i"
        } | ConvertTo-Json
        Invoke-RestMethod -Uri "$baseUrl/ecommerce/chat/message" -Method Post -ContentType "application/json" -Body $spamBody | Out-Null
    }
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 429) {
        $rateLimited = $true
    }
}
Assert-Test ($rateLimited -eq $true) "Session rate limiter blocked flood with HTTP 429 Too Many Requests"

Write-Host "=================================================" -ForegroundColor Cyan
$resColor = if ($failed -eq 0) { "Green" } else { "Red" }
Write-Host " RESULTS: $passed PASSED, $failed FAILED" -ForegroundColor $resColor
Write-Host "=================================================" -ForegroundColor Cyan
