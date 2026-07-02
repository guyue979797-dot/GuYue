FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN addgroup --system infolens \
    && adduser --system --ingroup infolens --home /app infolens

COPY requirements.txt .
RUN pip install --requirement requirements.txt

COPY infolens ./infolens
COPY web ./web
COPY web.py extract.py ./

RUN mkdir -p /data/output \
    && chown -R infolens:infolens /app /data

USER infolens

EXPOSE 8000
VOLUME ["/data/output"]

CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "8", "--timeout", "180", "--access-logfile", "-", "--error-logfile", "-", "web:app"]
