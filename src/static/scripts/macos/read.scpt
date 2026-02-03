tell application "System Events"
	set frontApp to first process whose frontmost is true
	set appName to name of frontApp
	
	tell frontApp
		set win to front window
		set winTitle to name of win
		
		-- Try to get UI elements with text
		set textContent to {}
		try
			set uiElems to entire contents of win
			repeat with elem in uiElems
				try
					set elemValue to value of elem
					if elemValue is not missing value and class of elemValue is text then
						if length of elemValue > 0 then
							set end of textContent to elemValue
						end if
					end if
				end try
			end repeat
		end try
	end tell
end tell

return {app:appName, window:winTitle, content:textContent}