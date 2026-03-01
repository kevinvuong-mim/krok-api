const Redis = require('ioredis');
const path = require('node:path');
const { Worker } = require('bullmq');
const { spawn } = require('node:child_process');

const concurrency = 1;
const expectedJobName = process.env.KARAOKE_JOB_NAME || 'process-video';
const queueName = process.env.KARAOKE_QUEUE_NAME || 'karaoke-processing';

const redisConnection = new Redis({
  maxRetriesPerRequest: null,
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
});

function runPipeline(videoId, jobId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'pipeline.py');
    const payload = JSON.stringify({ videoId, jobId });

    const child = spawn('python3', [scriptPath, payload], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk.toString());
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const errorMessage = stderr.trim() || stdout.trim() || `Pipeline exited with code ${code}`;
        reject(new Error(errorMessage));
        return;
      }

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const resultLine = lines[lines.length - 1] || '{}';

      try {
        resolve(JSON.parse(resultLine));
      } catch {
        reject(new Error('Failed to parse worker output'));
      }
    });
  });
}

const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name !== expectedJobName) throw new Error(`Unsupported job name: ${job.name}`);

    const videoId = typeof job.data?.videoId === 'string' ? job.data.videoId : null;
    if (!videoId) throw new Error('Missing videoId in job data');

    return runPipeline(videoId, String(job.id));
  },
  {
    concurrency,
    connection: redisConnection,
    lockDuration: 600000, // 10 minutes - for long-running video processing
    lockRenewTime: 300000, // Renew lock every 5 minutes
  },
);

worker.on('completed', (job) => {
  process.stdout.write(`[worker] Job completed: ${job.id}\n`);
});

worker.on('failed', (job, error) => {
  process.stderr.write(`[worker] Job failed: ${job?.id ?? 'unknown'} - ${error.message}\n`);
});

process.on('SIGINT', async () => {
  await worker.close();
  await redisConnection.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.close();
  await redisConnection.quit();
  process.exit(0);
});
