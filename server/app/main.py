"""App factory and lifespan."""

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Jolly Boar Inn", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/api/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    return app


app = create_app()
