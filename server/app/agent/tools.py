from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from app.services.weather import get_weather

weather_function = FunctionSchema(
    name="get_weather",
    description="Get current weather for a city.",
    properties={
        "city": {
            "type": "string",
            "description": "City name, such as Bengaluru or Mumbai",
        }
    },
    required=["city"],
)

tools = ToolsSchema(
    standard_tools=[weather_function]
)

async def handle_get_weather(params):
    city = params.arguments.get("city")

    if not city:
        await params.result_callback({
            "error": "City is required"
        })
        return

    try:
        result = await get_weather(city)
        await params.result_callback(result)
    except Exception:
        await params.result_callback({
            "error": "Weather service is temporarily unavailable"
        })