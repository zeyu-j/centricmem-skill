# CentricMem ambient refresher for goose (MOIM / "tom")
#
#   GOOSE_MOIM_MESSAGE_FILE -> %USERPROFILE%\.goose\centricmem-ambient.md
#
# goose injects the contents of that file into every turn. This script refreshes it from the hosted
# librarian, so the block stays current without anyone remembering to run anything.
#
#   powershell -NoProfile -File centricmem-ambient.ps1
#   powershell -NoProfile -File centricmem-ambient.ps1 -Shelf host
#
# Why it is a script and not a hook: a goose hook is a shell command, so it can only reach the
# librarian over HTTP with a Bearer. The MCP tools are the baseline and need no token at all; this
# script is the optional layer that puts the ambient text in front of the model before it asks.
#
# Token resolution (never printed, never copied):
#   1. $env:CENTRICMEM_API_KEY, then $env:CENTRICMEM_TOKEN   <- preferred
#   2. this machine's private client MCP file (plaintext legacy source, being phased out)
# Values are only ever used in memory. Diagnostics report a fingerprint, not the value.
#
# Three failures are distinguished on purpose, because they need different answers:
#   no key      - normal on an OAuth-connected host; there is nothing to rotate, use the MCP tools
#   refused     - the librarian answered 401/403: that is a credential problem
#   no answer   - the librarian did not respond: the transport case, which is also what leaves goose
#                 unable to initialise MCP. Probe with the CLI doctor, re-handshake, retry once.
#
# There is deliberately no fallback to a local hub: on a guest machine the CLI resolves the leftover
# copy, so a failed HTTP call used to arrive labelled status=OK carrying months-old context.

param(
  [string]$Shelf = 'centricmem',
  [string]$Out   = (Join-Path $HOME '.goose\centricmem-ambient.md')
)

$ErrorActionPreference = 'Stop'

function Fingerprint([string]$v) {
  if (-not $v) { return '<none>' }
  $h = [BitConverter]::ToString(
        [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($v))
       ).Replace('-', '')
  return ("{0}... len={1} fp={2}" -f $v.Substring(0, 4), $v.Length, $h.Substring(0, 8))
}

function Get-CentricToken {
  foreach ($n in @('CENTRICMEM_API_KEY', 'CENTRICMEM_TOKEN')) {
    $v = [Environment]::GetEnvironmentVariable($n)
    if ($v) { return [pscustomobject]@{ Token = $v; Source = "env:$n" } }
  }

  $mcp = Join-Path $HOME '.cursor\mcp.json'
  if (Test-Path $mcp) {
    try {
      $j = Get-Content $mcp -Raw | ConvertFrom-Json
      $h = $j.mcpServers.centricmem.headers.Authorization
      if ($h) {
        return [pscustomobject]@{
          Token  = (($h -replace '^Bearer\s+', '')).Trim()
          Source = 'mcp.json (plaintext legacy - prefer an env var)'
        }
      }
    } catch { }
  }

  $toml = Join-Path $HOME '.codex\config.toml'
  if (Test-Path $toml) {
    $m = Select-String -Path $toml -Pattern 'Bearer ([A-Za-z0-9_\-]+)' | Select-Object -First 1
    if ($m) {
      return [pscustomobject]@{
        Token  = $m.Matches[0].Groups[1].Value
        Source = 'codex config.toml (plaintext legacy - prefer an env var)'
      }
    }
  }

  return [pscustomobject]@{ Token = $null; Source = 'none' }
}

$env:CENTRICMEM_URL = if ($env:CENTRICMEM_URL) { $env:CENTRICMEM_URL } else { 'https://mem.centricmem.com' }

$cred = Get-CentricToken
if ($cred.Source -notlike 'env:*' -and $cred.Token) {
  Write-Warning ("CENTRICMEM_API_KEY / CENTRICMEM_TOKEN not set - falling back to {0}. Set an env var so token rotation does not depend on a plaintext file." -f $cred.Source)
}

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$body  = $null
$src   = 'none'
$httpStatus = $null
$fetchError = $null

if ($cred.Token) {
  # Preferred: librarian HTTP /ambient?project=<shelf> - resolves per-shelf context.
  try {
    $uri = "$($env:CENTRICMEM_URL.TrimEnd('/'))/ambient?project=$([uri]::EscapeDataString($Shelf))"
    $r   = Invoke-WebRequest -Uri $uri -Headers @{ Authorization = "Bearer $($cred.Token)" } -UseBasicParsing -TimeoutSec 20
    $j   = $r.Content | ConvertFrom-Json
    if ($j.text) { $body = $j.text.Trim(); $src = 'http' }
  } catch {
    # Keep the reason: a status code means the librarian answered (credentials), no status means the
    # request never landed (transport or network) - two different problems, two different remedies.
    $httpStatus = try { [int]$_.Exception.Response.StatusCode } catch { $null }
    $fetchError = $_.Exception.Message
  }

  # No CLI fallback on purpose. On a guest machine the CLI resolves the leftover local hub, so a
  # failed HTTP call used to come back as "source=cli status=OK" carrying months-old context (observed
  # 2026-09-23: Health=60, ancient-medicine corpus, decisions 0024-0026, while the librarian holds the
  # live shelf). A stale ambient is worse than none: if the librarian cannot be reached, say so below.
}

if (-not $cred.Token -or -not $body) {
  $status = 'ERROR'
  if (-not $cred.Token) {
    # No key on this machine is normal for an OAuth-connected host. Do not send anyone to rotate a
    # key they do not hold, and do not build a hub (see the skill: connect guidance).
    $body = @(
      "CentricMem ambient UNAVAILABLE (shelf=$Shelf): no key on this machine.",
      "",
      "If this host connected over OAuth, that is expected - use the MCP tools (cm_*), not the CLI.",
      "Otherwise: run `/connect?device=` on this machine, or set CENTRICMEM_API_KEY, then re-run this script.",
      "Do not create a hub. Nothing below is trustworthy."
    ) -join "`n"
  } elseif ($httpStatus) {
    # The librarian answered and refused: that is a credential problem, not a transport one.
    $body = @(
      "CentricMem ambient UNAVAILABLE (shelf=$Shelf): the librarian answered $httpStatus (token $((Fingerprint $cred.Token))).",
      "",
      "A refusal is about the key, not the session: rotate or re-mint it in Manager settings, then re-run this script.",
      "Nothing below is trustworthy."
    ) -join "`n"
  } else {
    # No answer at all. This is the case that also leaves goose unable to initialize MCP: the session
    # is dead even though the token is fine, and nothing inside the Skill can be read while it is.
    $body = @(
      "CentricMem ambient UNAVAILABLE (shelf=$Shelf): the librarian did not answer this refresh ($fetchError).",
      "",
      "If the cm_* tools are missing, or goose reported 'failed to initialize MCP client' or a transport",
      "send error, then the MCP session is dead - not the key. In that order:",
      "  1. probe the service:  centricmem doctor   (a CLI call opens its own request, so it still works)",
      "  2. cycle this extension: disable then enable centricmem (or restart goose)",
      "  3. retry once.",
      "",
      "If the probe fails too, the librarian or this machine's network is the problem - say so to the human",
      "and carry on without memory. Do not create a hub. Nothing below is trustworthy."
    ) -join "`n"
  }
} else {
  $status = 'OK'
}

$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

$header = "# CentricMem ambient (MOIM) | shelf=$Shelf | refreshed=$stamp | source=$src | status=$status"
Set-Content -Path $Out -Value ($header + "`n`n" + $body) -Encoding UTF8

Write-Output "file   = $Out"
Write-Output "status = $status"
Write-Output "token  = $((Fingerprint $cred.Token))  from $($cred.Source)"
