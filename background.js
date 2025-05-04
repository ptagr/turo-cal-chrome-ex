chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.type === "sync_calendar") {
    console.log("📥 Received sync_calendar message");
    const calendarData = message.payload;
    console.log("📦 Payload received:", calendarData);

    if (!Array.isArray(calendarData) || calendarData.length === 0) {
      console.warn("⚠️ No calendar data to sync");
      return;
    }

    const token = await getAuthToken();
    const calendarLinks = [];

    let colorIndex = 1;
    const availableColors = [2, 3, 5, 6, 7, 9, 10, 11];

    for (const vehicle of calendarData) {
      const calendarColor = availableColors[colorIndex % availableColors.length];
      colorIndex++;

      console.log(`🚗 Processing vehicle: ${vehicle.vehicleName}`);
      const calendarId = await getOrCreateCalendar(vehicle, token, calendarColor);

      console.log(`🧹 Clearing events for calendar: ${calendarId}`);
      await clearCalendarEvents(calendarId, token);

      if (!vehicle.events || vehicle.events.length === 0) {
        console.warn(`⚠️ No events found for ${vehicle.vehicleName}`);
      }

      for (const event of vehicle.events) {
        console.log(`🗓 Adding event: ${event.summary} from ${event.start.dateTime} to ${event.end.dateTime}`);
        await addEventToCalendar(calendarId, event, token);
      }

      const link = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}`;
      calendarLinks.push({ vehicleName: vehicle.vehicleName, url: link });
    }

    console.log("✅ Sync complete. Sending calendar links to popup:", calendarLinks);
    chrome.runtime.sendMessage({ type: "calendar_links", payload: calendarLinks });
  }
});

function getAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, token => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

async function getOrCreateCalendar(vehicle, token, colorId) {
  const vinSuffix = vehicle.vin?.slice(-5) || vehicle.vehicleId;
  const summary = `${vehicle.vehicleName} - ${vinSuffix}`;

  const existing = await findCalendarBySummary(summary, token);
  if (existing) {
    console.log(`🔁 Reusing calendar: ${summary}`);
    return existing.id;
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ summary })
  });

  const data = await res.json();

  await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList/${data.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ colorId: String(colorId) })
  });

  await makeCalendarPublic(data.id, token);
  return data.id;
}

async function findCalendarBySummary(summary, token) {
  const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();
  return data.items?.find(cal => cal.summary === summary);
}

async function makeCalendarPublic(calendarId, token) {
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/acl`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      scope: { type: 'default' }
    })
  });
}

async function addEventToCalendar(calendarId, event, token) {
  console.log("🛰 Sending event to Google Calendar:", {
    summary: event.summary,
    location: event.location,
    start: event.start,
    end: event.end
  });

  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      summary: event.summary,
      location: event.location,
      description: event.description,
      start: event.start,
      end: event.end
    })
  });
}

async function clearCalendarEvents(calendarId, token) {
  let pageToken = null;

  try {
    do {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`);
      url.searchParams.set('maxResults', '2500');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(`Failed to list events: ${error.error?.message || res.statusText}`);
      }

      const data = await res.json();
      const events = data.items || [];

      for (const event of events) {
        const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!delRes.ok) {
          const delError = await delRes.json();
          console.warn(`Failed to delete event ${event.id}: ${delError.error?.message || delRes.statusText}`);
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.error("Error in clearCalendarEvents:", err.message || err);
    return;
  }
}
