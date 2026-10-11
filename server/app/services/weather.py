import httpx


async def get_weather(city: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        geo_response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": city, "count": 1},
        )
        geo_response.raise_for_status()
        locations = geo_response.json().get("results", [])

        if not locations:
            return {"error": f"City '{city}' not found"}

        location = locations[0]

        weather_response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "current": "temperature_2m,relative_humidity_2m,wind_speed_10m",
            },
        )
        weather_response.raise_for_status()

        return {
            "city": location["name"],
            "country": location.get("country"),
            "weather": weather_response.json()["current"],
        }