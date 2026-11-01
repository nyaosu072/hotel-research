// Status rules (UI mirror of the DB rule; the DB is the final enforcer) and OTA search links.
export const STATUSES = ["candidate", "contacted", "confirmed", "done", "excluded"];

export function canSetStatus(hotel, status) {
  if (["contacted", "confirmed", "done"].includes(status)) return (hotel.homepage ?? "").trim() !== "";
  return true;
}

export function otaLinks(hotel) {
  const name = hotel.name_en || hotel.name_ja || hotel.name_ko || "";
  const q = encodeURIComponent(name);
  return {
    booking: `https://www.booking.com/searchresults.html?ss=${q}`,
    agoda: `https://www.agoda.com/search?textToSearch=${q}`,
    trip: `https://www.trip.com/hotels/list?keyword=${q}`,
    gmaps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}
