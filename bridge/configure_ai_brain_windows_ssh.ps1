#requires -RunAsAdministrator
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^ssh-ed25519\s+\S+(\s+\S+)?$')]
    [string]$MacPublicKey,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$TargetUser,

    [Parameter(Mandatory)]
    [string]$ResultPath
)

$ErrorActionPreference = 'Stop'
$stage = 'initialization'
$configChanged = $false
$serviceStarted = $false
$backupPath = $null
$ownedFirewallRule = $false
$effectiveChecks = $null
$pathChecks = $null
$validationChecks = $null

function Write-SafeResult {
    param(
        [Parameter(Mandatory)]
        [hashtable]$Result,

        [Parameter(Mandatory)]
        [int]$ExitCode
    )

    $parent = Split-Path -Parent $ResultPath
    if ($parent) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    $Result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultPath -Encoding utf8
    exit $ExitCode
}

function Get-EnabledInboundTcp22AllowRules {
    $matches = @()
    $rules = Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow

    foreach ($rule in $rules) {
        $filters = @($rule | Get-NetFirewallPortFilter)
        if ($filters | Where-Object { $_.Protocol -eq 'TCP' -and $_.LocalPort -eq '22' }) {
            $matches += $rule
        }
    }

    return @($matches | Sort-Object Name -Unique)
}

function Set-KeyFileAcl {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [bool]$TargetIsAdministrator,

        [Parameter(Mandatory)]
        [string]$AccountName
    )

    $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)

    if ($TargetIsAdministrator) {
        $acl.SetOwner($administratorsSid)
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($administratorsSid, 'FullControl', 'Allow'))
    } else {
        $userSid = [System.Security.Principal.NTAccount]::new($env:COMPUTERNAME, $AccountName).Translate([System.Security.Principal.SecurityIdentifier])
        $acl.SetOwner($userSid)
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($userSid, 'FullControl', 'Allow'))
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($administratorsSid, 'FullControl', 'Allow'))
    }

    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($systemSid, 'FullControl', 'Allow'))
    Set-Acl -LiteralPath $Path -AclObject $acl
}

try {
    $stage = 'identity'
    if ([Environment]::UserName -ne $TargetUser) {
        throw 'The elevated account does not match the requested Windows user.'
    }

    $groups = (& whoami /groups) -join [Environment]::NewLine
    $targetIsAdministrator = $groups -match 'S-1-5-32-544|BUILTIN\\Administrators|Administrators'

    $stage = 'openssh_capability'
    $capability = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
    if ($capability.State -ne 'Installed') {
        $installResult = Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
        if ($installResult.RestartNeeded) {
            Write-SafeResult -Result @{
                Status = 'restart_required'
                UserName = $TargetUser
                RestartRequired = $true
            } -ExitCode 3010
        }
    }

    $stage = 'ssh_paths'
    $sshRoot = Join-Path $env:ProgramData 'ssh'
    $configPath = Join-Path $sshRoot 'sshd_config'
    $openSshRoots = @(
        (Join-Path $env:WINDIR 'System32\OpenSSH'),
        (Join-Path $env:WINDIR 'Sysnative\OpenSSH')
    ) | Where-Object { Test-Path -LiteralPath $_ }
    $openSshRoot = $openSshRoots | Select-Object -First 1
    $defaultConfigPath = if ($openSshRoot) { Join-Path $openSshRoot 'sshd_config_default' } else { $null }
    $sshdPath = if ($openSshRoot) { Join-Path $openSshRoot 'sshd.exe' } else { $null }
    $service = Get-Service -Name sshd
    $pathChecks = @{
        OpenSshRootFound = [bool]$openSshRoot
        SshdExecutablePresent = [bool]($sshdPath -and (Test-Path -LiteralPath $sshdPath))
        DefaultConfigPresent = [bool]($defaultConfigPath -and (Test-Path -LiteralPath $defaultConfigPath))
        SshdServicePresent = [bool]$service
    }
    if (-not $pathChecks.SshdExecutablePresent) {
        throw 'OpenSSH server executable is unavailable after installation.'
    }

    $stage = 'tailscale_only_firewall'
    $ruleName = 'AI-Brain-SSH-Tailscale'
    Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 22 -RemoteAddress '100.64.0.0/10' -Profile Any -EdgeTraversalPolicy Block | Out-Null
    $ownedFirewallRule = $true

    $otherInboundTcp22Rules = @(Get-EnabledInboundTcp22AllowRules | Where-Object { $_.DisplayName -ne $ruleName })
    foreach ($rule in $otherInboundTcp22Rules) {
        Disable-NetFirewallRule -InputObject $rule | Out-Null
    }

    # The Windows service performs its own first-start host-key initialization.
    # The scoped firewall is active before that start and no client key is generated here.
    $stage = 'openssh_bootstrap'
    Start-Service -Name sshd
    $serviceStarted = $true
    Start-Sleep -Seconds 1
    Stop-Service -Name sshd
    $serviceStarted = $false

    $stage = 'config_bootstrap'
    New-Item -ItemType Directory -Path $sshRoot -Force | Out-Null
    if (-not (Test-Path -LiteralPath $configPath)) {
        if (-not (Test-Path -LiteralPath $defaultConfigPath)) {
            throw 'OpenSSH default configuration is unavailable.'
        }
        Copy-Item -LiteralPath $defaultConfigPath -Destination $configPath -Force
    }

    $stage = 'backup'
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = Join-Path $sshRoot ('sshd_config.ai-brain-backup-' + $stamp)
    Copy-Item -LiteralPath $configPath -Destination $backupPath -Force

    $stage = 'authorized_keys'
    if ($targetIsAdministrator) {
        $authorizedKeysPath = Join-Path $sshRoot 'administrators_authorized_keys'
        $authorizedKeysSetting = '__PROGRAMDATA__/ssh/administrators_authorized_keys'
    } else {
        $authorizedKeysDirectory = Join-Path $env:USERPROFILE '.ssh'
        New-Item -ItemType Directory -Path $authorizedKeysDirectory -Force | Out-Null
        $authorizedKeysPath = Join-Path $authorizedKeysDirectory 'authorized_keys'
        $authorizedKeysSetting = '.ssh/authorized_keys'
    }

    # This endpoint intentionally accepts only the supplied Mac AI Brain public key.
    Set-Content -LiteralPath $authorizedKeysPath -Value $MacPublicKey -Encoding ascii -NoNewline
    Set-KeyFileAcl -Path $authorizedKeysPath -TargetIsAdministrator:$targetIsAdministrator -AccountName $TargetUser

    $stage = 'sshd_config'
    $lines = @([string[]](Get-Content -LiteralPath $configPath))
    $withoutManagedBlock = New-Object System.Collections.Generic.List[string]
    $insideManagedBlock = $false

    foreach ($line in $lines) {
        if ($line -match '^\s*# BEGIN AI-BRAIN SSH ACCESS\s*$') {
            $insideManagedBlock = $true
            continue
        }
        if ($line -match '^\s*# END AI-BRAIN SSH ACCESS\s*$') {
            $insideManagedBlock = $false
            continue
        }
        if (-not $insideManagedBlock) {
            [void]$withoutManagedBlock.Add($line)
        }
    }

    $firstMatchIndex = -1
    for ($i = 0; $i -lt $withoutManagedBlock.Count; $i++) {
        if ($withoutManagedBlock[$i] -match '^\s*Match\s+') {
            $firstMatchIndex = $i
            break
        }
    }

    if ($firstMatchIndex -lt 0) {
        $globalLines = @($withoutManagedBlock)
        $matchLines = @()
    } elseif ($firstMatchIndex -eq 0) {
        $globalLines = @()
        $matchLines = @($withoutManagedBlock)
    } else {
        $globalLines = @($withoutManagedBlock.GetRange(0, $firstMatchIndex))
        $matchLines = @($withoutManagedBlock.GetRange($firstMatchIndex, $withoutManagedBlock.Count - $firstMatchIndex))
    }

    $globalLines = @($globalLines | Where-Object {
        $_ -notmatch '^\s*(PubkeyAuthentication|PasswordAuthentication|KbdInteractiveAuthentication|AuthorizedKeysFile|AllowUsers)\s+'
    })

    $managedBlock = @(
        '# BEGIN AI-BRAIN SSH ACCESS',
        'PubkeyAuthentication yes',
        'PasswordAuthentication no',
        'KbdInteractiveAuthentication no',
        ('AuthorizedKeysFile ' + $authorizedKeysSetting),
        ('AllowUsers ' + $TargetUser),
        '# END AI-BRAIN SSH ACCESS'
    )

    Set-Content -LiteralPath $configPath -Value @($globalLines + $managedBlock + $matchLines) -Encoding ascii
    $configChanged = $true

    $stage = 'config_syntax'
    & $sshdPath -t -f $configPath
    if ($LASTEXITCODE -ne 0) {
        throw 'sshd configuration syntax validation failed.'
    }

    $stage = 'effective_config'
    $effective = @(& $sshdPath -T -f $configPath -C ('user=' + $TargetUser + ',host=localhost,addr=100.68.119.126'))
    if ($LASTEXITCODE -ne 0) {
        throw 'sshd effective configuration validation failed.'
    }
    $effectiveText = $effective -join [Environment]::NewLine
    $effectiveChecks = @{
        PubkeyAuthentication = $effectiveText -match '(?m)^pubkeyauthentication yes\s*$'
        PasswordAuthentication = $effectiveText -match '(?m)^passwordauthentication no\s*$'
        KbdInteractiveAuthentication = $effectiveText -match '(?m)^kbdinteractiveauthentication no\s*$'
        AllowUsers = $effectiveText -match ('(?m)^allowusers ' + [regex]::Escape($TargetUser) + '\s*$')
        AuthorizedKeysFile = $effectiveText -match ('(?im)^authorizedkeysfile .*' + [regex]::Escape((Split-Path -Leaf $authorizedKeysPath)))
    }
    if ($effectiveChecks.Values -contains $false) {
        throw 'sshd effective configuration did not satisfy the key-only access policy.'
    }

    $stage = 'service_start'
    Set-Service -Name sshd -StartupType Automatic
    Start-Service -Name sshd
    $serviceStarted = $true

    $stage = 'validation'
    & $sshdPath -t -f $configPath
    $syntaxPassed = ($LASTEXITCODE -eq 0)
    if (-not $syntaxPassed) {
        throw 'sshd syntax validation failed after service start.'
    }

    $loopback = Test-NetConnection -ComputerName '127.0.0.1' -Port 22 -WarningAction SilentlyContinue
    $service = Get-Service -Name sshd
    $remainingOtherAllows = @(Get-EnabledInboundTcp22AllowRules | Where-Object { $_.DisplayName -ne $ruleName })
    $scope = ((Get-NetFirewallRule -DisplayName $ruleName | Get-NetFirewallAddressFilter).RemoteAddress -join ',')
    $scopeIsExpected = $scope -in @('100.64.0.0/10', '100.64.0.0/255.192.0.0')

    $validationChecks = @{
        SshdRunning = $service.Status -eq 'Running'
        SshdSyntaxPassed = $syntaxPassed
        LoopbackTcp22Succeeded = [bool]$loopback.TcpTestSucceeded
        OtherInboundTcp22AllowRuleCount = $remainingOtherAllows.Count
        FirewallRemoteAddress = $scope
        FirewallScopeIsExpected = $scopeIsExpected
    }

    if (-not $validationChecks.SshdRunning) {
        throw 'sshd did not remain running.'
    }
    if (-not $validationChecks.LoopbackTcp22Succeeded) {
        throw 'TCP 22 loopback validation failed.'
    }
    if ($validationChecks.OtherInboundTcp22AllowRuleCount -ne 0) {
        throw 'An enabled inbound TCP 22 allow rule remains outside the Tailscale-only rule.'
    }
    if (-not $validationChecks.FirewallScopeIsExpected) {
        throw 'The SSH firewall rule does not have the required Tailscale-only remote scope.'
    }

    Write-SafeResult -Result @{
        Status = 'completed'
        UserName = $TargetUser
        TargetIsAdministrator = $targetIsAdministrator
        BackupPath = $backupPath
        AuthorizedKeysPath = $authorizedKeysPath
        SshdService = [string]$service.Status
        SshdSyntaxPassed = $syntaxPassed
        LoopbackTcp22Succeeded = [bool]$loopback.TcpTestSucceeded
        FirewallRuleName = $ruleName
        FirewallRemoteAddress = $scope
        DisabledOtherInboundTcp22AllowRules = $otherInboundTcp22Rules.Count
    } -ExitCode 0
} catch {
    if ($serviceStarted) {
        Stop-Service -Name sshd -ErrorAction SilentlyContinue
    }
    if ($configChanged -and $backupPath -and (Test-Path -LiteralPath $backupPath)) {
        Copy-Item -LiteralPath $backupPath -Destination $configPath -Force -ErrorAction SilentlyContinue
    }
    if ($ownedFirewallRule) {
        Get-NetFirewallRule -DisplayName 'AI-Brain-SSH-Tailscale' -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    }
    Write-SafeResult -Result @{
        Status = 'failed'
        Stage = $stage
        ErrorClass = $_.Exception.GetType().FullName
        EffectiveChecks = $effectiveChecks
        PathChecks = $pathChecks
        ValidationChecks = $validationChecks
    } -ExitCode 1
}
