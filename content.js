(async () => {
    const response = await fetch("https://turo.com/api/fleet/calendar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        daysPerPage: 31,
        includeVehicleDetails: true,
        startDate: new Date().toISOString().split("T")[0],
        vehicleIds: [3087894] // You can automate this for all user vehicles
      })
    });
  
    const data = await response.json();
  
    window.__turoCalendarData = Array.isArray(data.fleetCalendar)
      ? data.fleetCalendar.map(vehicle => {
          const events = [];
  
          vehicle.dailyData.forEach(day => {
            (day.unavailabilities || []).forEach(u => {
              events.push({
                summary: `${vehicle.vehicleDetails.name} - Reserved`,
                start: `${day.date}T${u.start?.time || "00:00"}:00`,
                end: `${day.date}T${u.end?.time || "23:59"}:00`,
                timeZone: vehicle.vehicleDetails.vehicleTimeZone
              });
            });
          });
  
          return {
            vehicleId: vehicle.vehicleDetails.id,
            vehicleName: vehicle.vehicleDetails.name,
            events
          };
        })
      : [];
  })();
  