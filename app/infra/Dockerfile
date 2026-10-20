FROM node:22-alpine AS frontend
WORKDIR /app
COPY app/frontend/package.json app/frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/frontend .
RUN npm run build


FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app

COPY app/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/backend /app
RUN mkdir -p /app/data/uploads \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]


FROM base AS test
USER root
COPY app/backend/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
USER appuser
CMD ["pytest", "-q"]


FROM base AS runtime
COPY --from=frontend --chown=appuser:appuser /app/dist /app/static
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
