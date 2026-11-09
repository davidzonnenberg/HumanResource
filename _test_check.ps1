Set-Location "c:\Users\David\OneDrive\Laptop Python\Human Resource"
$log = Join-Path $env:TEMP "hr_test_out.txt"
& npm.cmd test *> $log
$code = $LASTEXITCODE
Add-Content $log "---EXITCODE=$code---"
