# Reminds Claude to append a Change Log entry to CODEX_NOTES.md after every Edit/Write/MultiEdit,
# except when the edit is to CODEX_NOTES.md itself (which would loop forever).
# Wired up by .claude/settings.json (PostToolUse hook).

$ErrorActionPreference = 'SilentlyContinue'

try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $payload = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$file = $payload.tool_input.file_path
if (-not $file) { exit 0 }

# Skip the changelog file itself, and skip non-project paths to be safe.
if ($file -like '*CODEX_NOTES.md') { exit 0 }
if ($file -like '*.claude\hooks\*') { exit 0 }

$now = Get-Date -Format 'yyyy-MM-dd HH:mm'
$msg = "REMINDER: You just edited '$file'. Before responding to the user, append a new entry at the TOP of the '## Change Log' section in CODEX_NOTES.md using timestamp: $now. One concise entry per logical change. Skip this only if the edit was trivial (whitespace/comment-only) or the changelog already covers it."

$out = @{
    hookSpecificOutput = @{
        hookEventName     = 'PostToolUse'
        additionalContext = $msg
    }
}

$out | ConvertTo-Json -Compress
