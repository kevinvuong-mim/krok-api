FROM node:20-bookworm
WORKDIR /app/worker

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg git \
  && rm -rf /var/lib/apt/lists/*

COPY worker/package.json ./package.json
RUN npm install

COPY worker/requirements.txt ./requirements.txt
RUN pip3 install --break-system-packages --no-cache-dir -r requirements.txt

COPY worker/. ./

CMD ["node", "bullmq-worker.js"]
