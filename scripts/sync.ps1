param(
  [switch]$SkipDbPush,
  [switch]$SkipGitPush,
  [switch]$SkipNetlifyDeploy
)

$ErrorActionPreference = "Stop"

Write-Host "Starting project sync..." -ForegroundColor Cyan

if (-not $SkipDbPush) {
  Write-Host "-> Running Supabase migrations (npx supabase db push)..." -ForegroundColor Yellow
  npx supabase db push
}

if (-not $SkipGitPush) {
  Write-Host "-> Pushing Git changes..." -ForegroundColor Yellow
  git push
}

if (-not $SkipNetlifyDeploy) {
  Write-Host "-> Triggering Netlify production deploy..." -ForegroundColor Yellow
  netlify deploy --prod
}

Write-Host "Sync complete." -ForegroundColor Green
