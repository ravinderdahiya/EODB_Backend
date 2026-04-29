import fetch from "node-fetch";

export const getIPLocation = async (ip) => {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await res.json();

    return {
      latitude: data.lat,
      longitude: data.lon,
      city: data.city,
      country: data.country
    };
  } catch (error) {
    console.log("IP Location Error:", error);
    return null;
  }
};