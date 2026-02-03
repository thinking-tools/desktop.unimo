set output to ""

-- Safari
if application "Safari" is running then
	set output to output & "=== Safari ===" & linefeed
	tell application "Safari"
		repeat with w in windows
			try
				repeat with t in tabs of w
					set output to output & (name of t) & linefeed & "  " & (URL of t) & linefeed
				end repeat
			end try
		end repeat
	end tell
end if

-- Chrome
if application "Google Chrome" is running then
	set output to output & "=== Chrome ===" & linefeed
	tell application "Google Chrome"
		repeat with w in windows
			try
				repeat with t in tabs of w
					set output to output & (title of t) & linefeed & "  " & (URL of t) & linefeed
				end repeat
			end try
		end repeat
	end tell
end if

-- Arc
if application "Arc" is running then
	set output to output & "=== Arc ===" & linefeed
	tell application "Arc"
		repeat with w in windows
			try
				repeat with t in tabs of w
					set output to output & (title of t) & linefeed & "  " & (URL of t) & linefeed
				end repeat
			end try
		end repeat
	end tell
end if

-- Zen (Firefox-based - window titles only)
if application "zen" is running then
	set output to output & "=== Zen (window titles only) ===" & linefeed
	tell application "System Events"
		tell process "zen"
			repeat with w in windows
				try
					set output to output & (name of w) & linefeed
				end try
			end repeat
		end tell
	end tell
end if

-- Firefox (window titles only)
if application "Firefox" is running then
	set output to output & "=== Firefox (window titles only) ===" & linefeed
	tell application "System Events"
		tell process "Firefox"
			repeat with w in windows
				try
					set output to output & (name of w) & linefeed
				end try
			end repeat
		end tell
	end tell
end if

if output is "" then set output to "No supported browsers running"

return output