use framework "Foundation"
use framework "AppKit"
use scripting additions

set screenFrame to current application's NSScreen's mainScreen()'s visibleFrame()
set screenX to (item 1 of item 1 of screenFrame) as integer
set screenY to (item 2 of item 1 of screenFrame) as integer
set screenW to (item 1 of item 2 of screenFrame) as integer
set screenH to (item 2 of item 2 of screenFrame) as integer

set windowRefs to {}
tell application "System Events"
	set allProcesses to every process whose visible is true
	repeat with proc in allProcesses
		try
			repeat with win in (every window of proc)
				set winSize to size of win
				if (item 1 of winSize) > 50 and (item 2 of winSize) > 50 then
					set end of windowRefs to win
				end if
			end repeat
		end try
	end repeat
end tell

set winCount to count of windowRefs
if winCount = 0 then return "No windows"

set numCols to (winCount ^ 0.5) as integer
if numCols < 1 then set numCols to 1
if numCols * numCols < winCount then set numCols to numCols + 1
set numRows to ((winCount - 1) div numCols) + 1

set cellW to screenW div numCols
set cellH to screenH div numRows
set padding to 10

set idx to 0
tell application "System Events"
	repeat with win in windowRefs
		set colIdx to idx mod numCols
		set rowIdx to idx div numCols
		
		set newX to screenX + (colIdx * cellW) + padding
		set newY to screenY + (rowIdx * cellH) + padding
		set newW to cellW - (padding * 2)
		set newH to cellH - (padding * 2)
		
		set position of win to {newX, newY}
		set size of win to {newW, newH}
		
		set idx to idx + 1
	end repeat
end tell

return "Arranged " & winCount & " into " & numCols & "x" & numRows