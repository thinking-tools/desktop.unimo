tell application "System Events"
	set windowList to {}
	set allProcesses to every process whose visible is true
	
	repeat with proc in allProcesses
		set procName to name of proc
		try
			set appWindows to every window of proc
			repeat with win in appWindows
				set winName to name of win
				set winPos to position of win
				set winSize to size of win
				set end of windowList to {app:procName, title:winName, x:(item 1 of winPos), y:(item 2 of winPos), width:(item 1 of winSize), height:(item 2 of winSize)}
			end repeat
		end try
	end repeat
	
	return windowList
end tell