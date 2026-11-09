Set-Location "c:\Users\David\OneDrive\Laptop Python\Human Resource"
$log = Join-Path $env:TEMP "hr_tc_out.txt"
& npm.cmd run typecheck --workspace @hr/web *> $log
$code = $LASTEXITCODE
Add-Content $log "---EXITCODE=$code---"
