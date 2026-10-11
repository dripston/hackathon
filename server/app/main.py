from fastapi import FastAPI

app = FastAPI(title="AI Voice Agent Service")


@app.get("/health")
async def health():
    return {"status": "ok"}