import os

from pipecat.services.groq.llm import GroqLLMService

from app.agent.tools import (
    tools,
    handle_get_weather,
)


def create_llm():
    llm = GroqLLMService(
        api_key=os.environ["GROQ_API_KEY"],
        model="llama-3.3-70b-versatile",
    )

    llm.register_function(
        "get_weather",
        handle_get_weather,
    )

    return llm