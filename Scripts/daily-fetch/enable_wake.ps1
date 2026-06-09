$ErrorActionPreference = 'Stop'
try {
    $s = New-Object -ComObject Schedule.Service
    $s.Connect()
    $t = $s.GetFolder('\').GetTask('DailyTechFetch_Auto')

    # Use IRegisteredTask COM interface directly via reflection
    $settingsType = [System.Type]::GetType('Microsoft.Win32.TaskScheduler.TaskSettings')
    if ($null -eq $settingsType) {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[ComVisible(true)]
public class TaskSettingsHelper { }
"@
    }

    # Direct property access via COM late binding
    $taskName = 'DailyTechFetch_Auto'
    $folder = $s.GetFolder('\')

    # Get task definition
    $xml = $t.Xml
    Write-Output '--- Original XML ---'
    Write-Output $xml

    # Modify XML
    $newXml = $xml -replace '<DisallowStartIfOnBatteries>true</DisallowStartIfOnBatteries>', '<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>'

    if ($newXml -notmatch '<WakeToRun>') {
        $newXml = $newXml -replace '(<Settings>)', '$1<WakeToRun>true</WakeToRun>'
    }
    if ($newXml -notmatch '<StartWhenAvailable>') {
        $newXml = $newXml -replace '(<Settings>)', '$1<StartWhenAvailable>true</StartWhenAvailable>'
    }

    Write-Output '--- New XML ---'
    Write-Output $newXml

    # Re-register
    $null = $folder.RegisterTask($taskName, $newXml, 4, $null, $null, 3, $null)
    Write-Output '--- Re-registered successfully ---'

    # Verify
    $verify = $folder.GetTask($taskName)
    Write-Output '--- Verified XML ---'
    Write-Output $verify.Xml
} catch {
    Write-Output "ERROR: $_"
    exit 1
}