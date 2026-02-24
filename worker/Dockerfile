FROM node:20-bookworm
WORKDIR /app/worker

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg git espeak-ng libsndfile1 \

COPY worker/requirements.txt ./requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY worker/. ./

CMD ["node", "bullmq-worker.js"]
