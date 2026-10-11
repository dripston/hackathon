from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.services.llm_service import FunctionCallParams
from pydantic import ValidationError

from app.services.weather import WeatherError, WeatherService

tools = ToolsSchema(standard_tools=[FunctionSchema(
    name="get_weather",
    description="Get live current weather. Include state/country separated by commas if known or requested for clarification.",
    properties={"city": {"type": "string", "description": "City, optionally State, Country; e.g. Mumbai, India"}},
    required=["city"],
)])


def weather_handler(service: WeatherService):
    async def handle_get_weather(params: FunctionCallParams):
        try:
            result = await service.get_weather(params.arguments.get("city"))
        except ValidationError:
            result = {"error": {"code": "invalid_city", "message": "Please provide a city (1–120 characters)."}}
        except WeatherError as exc:
            result = {"error": exc.detail}
        await params.result_callback(result)
    return handle_get_weather
