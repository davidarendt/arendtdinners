$ErrorActionPreference = "Stop"

Write-Host "One-time setup for Supabase + Netlify automation" -ForegroundColor Cyan
Write-Host ""

Write-Host "1) Supabase login" -ForegroundColor Yellow
npx supabase login

Write-Host "2) Link Supabase project" -ForegroundColor Yellow
$supabaseProjectRef = Read-Host "Enter Supabase project ref (20 chars from project URL)"
npx supabase link --project-ref "$supabaseProjectRef"

Write-Host "3) Netlify login" -ForegroundColor Yellow
netlify login

Write-Host "4) Link Netlify site" -ForegroundColor Yellow
netlify link

Write-Host "5) Set Netlify env vars (prompts)" -ForegroundColor Yellow
$supabaseUrl = Read-Host "Enter SUPABASE_URL"
$supabaseAnon = Read-Host "Enter SUPABASE_ANON_KEY"

netlify env:set SUPABASE_URL "$supabaseUrl"
netlify env:set SUPABASE_ANON_KEY "$supabaseAnon"

Write-Host ""
Write-Host "One-time setup complete. Next time run: .\\scripts\\sync.ps1" -ForegroundColor Green
