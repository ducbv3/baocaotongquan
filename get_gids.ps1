$content = Get-Content -Raw -Path "C:\Users\Ducbv\.gemini\antigravity\brain\bd67975a-acb4-4a7b-947f-d1c370182b00\.system_generated\steps\234\content.md"
$pattern = '\[\d+,\d+,"(\d+)",\[\{"1":\[\[0,0,"([^"]+)"'
$regex = [regex]$pattern
$matches = $regex.Matches($content)
foreach ($match in $matches) {
    Write-Output ($match.Groups[2].Value + ": " + $match.Groups[1].Value)
}
