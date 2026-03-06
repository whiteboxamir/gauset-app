import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import router

app = FastAPI(title="Gauset Local Backend", version="1.0.0")

# Allow Next.js frontend to talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # local usage
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

if __name__ == "__main__":
    print("Starting FastAPI Local Server for Gauset...")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
