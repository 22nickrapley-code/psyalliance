# PsyAlliance v16: switch on phone alerts for one site.
# Run from C:\Users\Nick\Documents\psyalliance in PowerShell:
#   powershell -ExecutionPolicy Bypass -File docs\psyalliance-v16\setup-phone-alerts.ps1 -Site demo
#   powershell -ExecutionPolicy Bypass -File docs\psyalliance-v16\setup-phone-alerts.ps1 -Site live
# It makes fresh keys, stores them on the Cloudflare Worker as encrypted secrets (they survive every deploy),
# and writes the one piece of SQL you paste into Supabase to your Downloads folder. Nothing secret is printed.
param([ValidateSet("demo", "live")][string]$Site = "demo")
$ErrorActionPreference = "Stop"
$envArgs = @(); $url = "https://psyalliance.org"; $project = "vvmulsyvyjsxhcpqfpyo (live)"
if ($Site -eq "demo") { $envArgs = @("--env", "demo"); $url = "https://sandbox.psyalliance.org"; $project = "xsfqeepxnmnvlhxwkfnw (sandbox)" }

$keys = node scripts/make-vapid-keys.mjs
$pub = ($keys | Where-Object { $_ -like "VAPID_PUBLIC_KEY=*" }) -replace "^VAPID_PUBLIC_KEY=", ""
$priv = ($keys | Where-Object { $_ -like "VAPID_PRIVATE_KEY=*" }) -replace "^VAPID_PRIVATE_KEY=", ""
if (-not $pub -or -not $priv) { throw "Could not make the keys." }
$dispatch = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))

Write-Host ""
Write-Host "Supabase project $project : Project Settings, API Keys, the service_role (secret) key."
$svc = Read-Host "Paste it here, or just press Enter if it is already set on this Worker"

function Put([string]$name, [string]$value) {
  Write-Host "Saving $name ..."
  $value | npx wrangler secret put $name @envArgs | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cloudflare refused $name. Run 'npx wrangler login' and try again." }
}
Put "VAPID_PUBLIC_KEY" $pub
Put "VAPID_PRIVATE_KEY" $priv
Put "VAPID_SUBJECT" "mailto:hello@psyalliance.org"
Put "PHONE_ALERTS" "on"
Put "ALERT_DISPATCH_SECRET" $dispatch
if ($svc.Trim()) { Put "SUPABASE_SERVICE_ROLE_KEY" $svc.Trim() }

$sql = @"
-- PsyAlliance phone alerts for $url
-- Supabase project $project, SQL editor. Paste all of this and Run.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('alert-sender') where exists (select 1 from cron.job where jobname = 'alert-sender');
select cron.schedule('alert-sender', '* * * * *', `$`$
  select net.http_post(
    url := '$url/api/alerts/dispatch',
    headers := jsonb_build_object('x-dispatch-secret', '$dispatch')
  );
`$`$);
-- To stop alerts later: select cron.unschedule('alert-sender');
"@
$out = Join-Path $env:USERPROFILE "Downloads\psyalliance-alerts-$Site.sql"
Set-Content -Path $out -Value $sql -Encoding UTF8
Write-Host ""
Write-Host "Done on Cloudflare. Now paste $out into the Supabase SQL editor for $project and Run."
Write-Host "Delete that file afterwards: it holds the sender's password."
