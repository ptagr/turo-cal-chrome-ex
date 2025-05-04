chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "sync_calendar") {
      const calendarData = message.payload;
      const token = await getAuthToken();
      const calendarLinks = [];
  
      let colorIndex = 1;
      const availableColors = [2, 3, 5, 6, 7, 9, 10, 11]; // Use visible, pleasant ones
  
      for (const vehicle of calendarData) {
        const vehicleId = vehicle.vehicleId;
        const calendarColor = availableColors[colorIndex % availableColors.length];
        colorIndex++;
  
        const calendarId = await getOrCreateCalendar(vehicleId, token, calendarColor);
  
        await clearCalendarEvents(calendarId, token);
  
        for (const event of vehicle.events) {
          await addEventToCalendar(calendarId, event, token);
        }
  
        const link = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}`;
        calendarLinks.push({ vehicleName: vehicle.vehicleName, url: link });
      }
  
      // Send links to popup
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
  
  async function getOrCreateCalendar(vehicleId, token, colorId) {
    const existing = await findCalendarByVehicleId(vehicleId, token);
    if (existing) {
      console.log(`Reusing calendar for vehicle ${vehicleId}: ${existing.id}`);
      return existing.id;
    }
  
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ summary: `Turo Vehicle #${vehicleId}` })
    });
  
    const data = await res.json();
  
    // Set calendar color
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
  
  async function findCalendarByVehicleId(vehicleId, token) {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` }
    });
  
    const data = await res.json();
    return data.items?.find(cal => cal.summary === `Turo Vehicle #${vehicleId}`);
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
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: event.summary,
        start: { dateTime: event.start, timeZone: event.timeZone },
        end: { dateTime: event.end, timeZone: event.timeZone }
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
      // Prevent background crash on reload
      return;
    }
  }
  
  