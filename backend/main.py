from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="NetPulse API")

@app.get("/health")
async def health():
    return JSONResponse({"status": "ok"})

@app.get("/devices")
async def list_devices():
    return JSONResponse({"devices": []})

@app.get("/checks")
async def list_checks():
    return JSONResponse({"checks": []})

@app.get("/events")
async def list_events():
    return JSONResponse({"events": []})

@app.get("/alerts")
async def list_alerts():
    return JSONResponse({"alerts": []})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
