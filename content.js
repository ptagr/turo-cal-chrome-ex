(async () => {
  try {
    const res = await fetch("https://turo.com/api/v2/feeds/upcoming-trips?appMode=HOST", {
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      console.error("❌ Failed to fetch upcoming trips:", res.statusText);
      window.__turoCalendarData = [];
      return;
    }

    const data = await res.json();
    const trips = data.upcomingTripItems || [];

    // ✅ Filter unique reservations: keep only trip start events
    const uniqueTrips = [];
    const seen = new Set();

    for (const item of trips) {
      if (
        item.upcomingTripFeedItemType === "OWNER_TRIP_START" &&
        !seen.has(item.reservationId)
      ) {
        seen.add(item.reservationId);
        uniqueTrips.push(item);
      }
    }

    function buildCalendarEventsFromTrips(trips) {
      const byVehicle = {};

      trips.forEach(trip => {
        const vehicleId = trip.vehicle.id;
        const guestName = trip.actor?.name || "Guest";
        const startISO = new Date(trip.interval.start.epochMillis).toISOString();
        const endISO = new Date(trip.interval.end.epochMillis).toISOString();
        const timeZone = trip.timeZone || "America/Los_Angeles";
        const address = trip.address || "Pickup location unavailable";
        const mapLink = `https://maps.google.com/?q=${encodeURIComponent(address)}`;

        const event = {
          summary: `${guestName} - Reserved`,
          location: address,
          description: `Reservation ID: ${trip.reservationId}
Guest: ${guestName}
Vehicle: ${trip.vehicle.make} ${trip.vehicle.model} ${trip.vehicle.year} - ${trip.vehicle.vin?.slice(-5) || trip.vehicle.id}
License Plate: ${trip.vehicle.registration?.licensePlate || "N/A"}
Pickup Location: ${address}
Map: ${mapLink}
Trip URL: https://turo.com/us/en/trips/${trip.reservationId}`,
          start: {
            dateTime: startISO,
            timeZone
          },
          end: {
            dateTime: endISO,
            timeZone
          }
        };

        if (!byVehicle[vehicleId]) {
          byVehicle[vehicleId] = {
            vehicleId,
            vehicle: trip.vehicle, // ✅ include full vehicle object
            vehicleName: trip.vehicle.name || `${trip.vehicle.make} ${trip.vehicle.model}`,
            events: []
          };
        }

        byVehicle[vehicleId].events.push(event);
      });

      return Object.values(byVehicle);
    }

    const enriched = buildCalendarEventsFromTrips(uniqueTrips);
    window.__turoCalendarData = enriched;
    console.log("✅ __turoCalendarData is ready", enriched);
  } catch (err) {
    console.error("🚨 Error processing upcoming trips:", err);
    window.__turoCalendarData = [];
  }
})();
