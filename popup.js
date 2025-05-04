document.getElementById('syncBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  status.textContent = '🔄 Syncing...';

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab || !tab.url.includes("turo.com/us/en/trips")) {
      status.textContent = "❌ Please open a Turo Trips page (e.g. Booked or Calendar).";
      return;
    }

    // Safely attempt to get calendar data
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => window.__turoCalendarData
      },
      ([result]) => {
        const calendarData = result?.result;

        if (!Array.isArray(calendarData) || calendarData.length === 0) {
          status.textContent = "❌ Error: calendar data not found or invalid.";
          console.error("Invalid calendarData:", calendarData);
          return;
        }

        // Send to background for calendar sync
        chrome.runtime.sendMessage({ type: "sync_calendar", payload: calendarData });
        status.textContent = "📤 Syncing to Google Calendar...";
      }
    );
  });
});

// ✅ Listen for response with calendar links
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "calendar_links") {
    const status = document.getElementById('status');
    status.innerHTML = "✅ Calendars synced!<br><br>";

    message.payload.forEach(({ vehicleName, url }) => {
      const link = document.createElement('a');
      link.href = url;
      link.textContent = `📅 ${vehicleName}`;
      link.target = "_blank";
      link.style.display = "block";
      status.appendChild(link);
    });
  }
});
