# One image for every ShopLab service; compose.yaml picks which app each container runs.
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shoplab ./shoplab
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=2)" || exit 1
