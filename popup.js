document.getElementById('syncBtn').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.textContent = 'Syncing...';
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (!tab.url.includes("turo.com/us/en/trips/calendar")) {
          document.getElementById("status").textContent = "❌ Please open https://turo.com/us/en/trips/calendar before syncing.";
          return;
        }
      
        // Proceed to fetch data
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.__turoCalendarData
        }, ([result]) => {
          const calendarData = result?.result;
      
          if (!Array.isArray(calendarData)) {
            document.getElementById("status").textContent = "❌ Error: calendar data not found or invalid.";
            console.error("Invalid calendarData:", calendarData);
            return;
          }
      
          chrome.runtime.sendMessage({ type: "sync_calendar", payload: calendarData });
        });
      });
      
  });
  
  // Display calendar links after syncing
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "calendar_links") {
      const status = document.getElementById('status');
      status.innerHTML = "<strong>✅ Calendars synced!</strong><br><br>";
  
      message.payload.forEach(({ vehicleName, url }) => {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = `${vehicleName}`;
        link.target = "_blank";
        link.style.display = "block";
        status.appendChild(link);
      });
    }
  });
  