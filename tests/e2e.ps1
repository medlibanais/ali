# PrayerLock E2E — runs the 3 required flows against the local Supabase stack.
# Usage:  powershell -File tests/e2e.ps1
# Requires: npx supabase start (already running) + functions serve running.

$ErrorActionPreference = 'Stop'
$script:passed = 0
$script:failed = 0

$ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
$SVC = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
$API = "http://127.0.0.1:54321"
$FN = "http://127.0.0.1:54321/functions/v1"

function Check($name, $condition, $detail = '') {
  if ($condition) {
    $script:passed += 1
    Write-Output "PASS  $name"
  } else {
    $script:failed += 1
    Write-Output "FAIL  $name  $detail"
  }
}

function AnonHeaders { @{ apikey = $ANON; 'Content-Type' = 'application/json' } }
function AuthHeaders($jwt) { @{ apikey = $ANON; Authorization = "Bearer $jwt"; 'Content-Type' = 'application/json' } }
function ServiceHeaders { @{ apikey = $SVC; Authorization = "Bearer $SVC"; 'Content-Type' = 'application/json' } }

function New-User($email) {
  $u = Invoke-RestMethod -Uri "$API/auth/v1/admin/users" -Method Post -Headers (ServiceHeaders) -Body (@{ email = $email; password = 'StrongPass1!'; email_confirm = $true } | ConvertTo-Json) -TimeoutSec 20
  $login = Invoke-RestMethod -Uri "$API/auth/v1/token?grant_type=password" -Method Post -Headers (AnonHeaders) -Body (@{ email = $email; password = 'StrongPass1!' } | ConvertTo-Json) -TimeoutSec 20
  return @{ id = $u.id; jwt = $login.access_token }
}

$stamp = [DateTime]::UtcNow.ToString('HHmmss')

# ============================================================
Write-Output "`n=== FLOW 1: signup -> onboarding -> avatar -> first quest ==="
# ============================================================
$u1 = New-User "e2e.user1.$stamp@test.dev"

# onboarding completes (username + goals + first name)
$onb = Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($u1.id)" -Method Patch -Headers (AuthHeaders $u1.jwt) -Body (@{ username = "e2e_user1_$stamp"; first_name = 'E2E'; onboarding_completed = $true; timezone = 'UTC' } | ConvertTo-Json) -TimeoutSec 20
Check 'onboarding saved' ($? -eq $true)

# avatar config saved to JSONB
$cfg = '{"face":"oval","skin":"tan-3","hair":"short-wave","hairColor":"espresso","eyes":"almond","brows":"natural","nose":"straight","mouth":"soft-smile","facialHair":"none","glasses":"none","headwear":"none","outfit":"crewneck","outfitColor":"forest","bg":"sunrise"}'
Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($u1.id)" -Method Patch -Headers (AuthHeaders $u1.jwt) -Body "{`"avatar_config`": $cfg}" -TimeoutSec 20 | Out-Null
$prof = Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($u1.id)&select=avatar_config" -Headers (AuthHeaders $u1.jwt) -TimeoutSec 20
Check 'avatar config persisted' ($prof[0].avatar_config.face -eq 'oval') ($prof[0].avatar_config | ConvertTo-Json -Compress)

# daily quests assigned
$quests = Invoke-RestMethod -Uri "$API/rest/v1/rpc/assign_daily_quests" -Method Post -Headers (AuthHeaders $u1.jwt) -Body '{}' -TimeoutSec 20
Check '15 quests assigned' ($quests.Count -eq 15) "got $($quests.Count)"
Check '3 per pillar' (($quests | Group-Object pillar | ForEach-Object { $_.Count } | Sort-Object -Unique).Count -eq 1)

# complete first quest -> XP + badge
$c = Invoke-RestMethod -Uri "$API/rest/v1/rpc/complete_quest" -Method Post -Headers (AuthHeaders $u1.jwt) -Body (@{ p_quest_id = $quests[0].id } | ConvertTo-Json) -TimeoutSec 20
Check 'quest completion awards XP' ($c.xp_awarded -gt 0) ($c | ConvertTo-Json -Compress)
Check 'first_step badge unlocked' ($c.new_badges -contains 'first_step') ($c.new_badges | ConvertTo-Json -Compress)
Check 'streak is 1' ($c.current_streak -eq 1)

# ============================================================
Write-Output "`n=== FLOW 2: friend request -> accept -> visibility ==="
# ============================================================
$a = New-User "e2e.userA.$stamp@test.dev"
$b = New-User "e2e.userB.$stamp@test.dev"
Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($a.id)" -Method Patch -Headers (AuthHeaders $a.jwt) -Body (@{ username = "e2e_userA_$stamp"; first_name = 'Alpha'; onboarding_completed = $true } | ConvertTo-Json) | Out-Null
Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($b.id)" -Method Patch -Headers (AuthHeaders $b.jwt) -Body (@{ username = "e2e_userB_$stamp"; first_name = 'Beta'; onboarding_completed = $true } | ConvertTo-Json) | Out-Null

# A cannot see B's gamification before friendship
$pre = Invoke-RestMethod -Uri "$API/rest/v1/gamification?user_id=eq.$($b.id)" -Headers (AuthHeaders $a.jwt) -TimeoutSec 20
Check 'stranger blocked from stats' ($pre.Count -eq 0)

$req = Invoke-RestMethod -Uri "$API/rest/v1/rpc/send_friend_request" -Method Post -Headers (AuthHeaders $a.jwt) -Body (@{ p_addressee = $b.id } | ConvertTo-Json) -TimeoutSec 20
Check 'request pending' ($req.status -eq 'pending')

$acc = Invoke-RestMethod -Uri "$API/rest/v1/rpc/respond_friend_request" -Method Post -Headers (AuthHeaders $b.jwt) -Body (@{ p_friendship = $req.id; p_accept = $true } | ConvertTo-Json) -TimeoutSec 20
Check 'B accepts' ($acc.status -eq 'accepted')

$post = Invoke-RestMethod -Uri "$API/rest/v1/gamification?user_id=eq.$($b.id)" -Headers (AuthHeaders $a.jwt) -TimeoutSec 20
Check 'friend reads stats' ($post.Count -eq 1)

$badges = Invoke-RestMethod -Uri "$API/rest/v1/achievements?user_id=eq.$($a.id)&select=badge_id" -Headers (AuthHeaders $a.jwt) -TimeoutSec 20
Check 'social_spark for both' (($badges | ForEach-Object { $_.badge_id }) -contains 'social_spark')

# ============================================================
Write-Output "`n=== FLOW 3: forgot password (reset email) ==="
# ============================================================
Invoke-RestMethod -Uri "$API/auth/v1/recover" -Method Post -Headers (AnonHeaders) -Body (@{ email = "e2e.user1.$stamp@test.dev" } | ConvertTo-Json) -TimeoutSec 20 | Out-Null
Start-Sleep -Seconds 2
$mail = Invoke-RestMethod -Uri 'http://127.0.0.1:54324/api/v1/messages?limit=20' -TimeoutSec 20
$recovery = $mail.messages | Where-Object { $_.To[0].Address -eq "e2e.user1.$stamp@test.dev" -and $_.Subject -match 'Recovery|recovery|Reset' } | Select-Object -First 1
Check 'recovery email delivered' ($null -ne $recovery) "subjects: $(($mail.messages | ForEach-Object { $_.Subject }) -join ' | ')"

# rate limit messaging on repeated bad logins
$badRejected = $false
try {
  Invoke-RestMethod -Uri "$API/auth/v1/token?grant_type=password" -Method Post -Headers (AnonHeaders) -Body (@{ email = "e2e.user1.$stamp@test.dev"; password = 'WrongPass1!' } | ConvertTo-Json) -TimeoutSec 20 | Out-Null
} catch {
  $badRejected = $_.Exception.Response.StatusCode.value__ -eq 400
}
Check 'wrong password rejected' $badRejected

# ============================================================
Write-Output "`n=== RLS spot checks ==="
# ============================================================
# A cannot update B's profile
$updBlocked = $false
try {
  $r = Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($b.id)" -Method Patch -Headers (AuthHeaders $a.jwt) -Body '{"first_name":"HACKED"}' -TimeoutSec 20
  $updBlocked = ($r.Count -eq 0)
} catch { $updBlocked = $true }
$afterB = Invoke-RestMethod -Uri "$API/rest/v1/profiles?id=eq.$($b.id)&select=first_name" -Headers (AuthHeaders $b.jwt) -TimeoutSec 20
Check 'A cannot write B profile' ($afterB[0].first_name -eq 'Beta')

# A cannot read B's messages/conversations
$conv = Invoke-RestMethod -Uri "$API/rest/v1/conversations?user_id=eq.$($b.id)" -Headers (AuthHeaders $a.jwt) -TimeoutSec 20
Check 'A cannot read B conversations' ($conv.Count -eq 0)

Write-Output "`n==================================="
Write-Output "RESULT: $($script:passed) passed, $($script:failed) failed"
Write-Output "==================================="
exit $script:failed
