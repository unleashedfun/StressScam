export default {
  async scheduled(event, env, ctx) {
    // ===== 最大壓測設定（已接近 Worker 極限）=====
    const TARGET_URL = "https://salesiq.zohopublic.com/wspp/logdebuginfo.ls"; // ← 改成你的網址
    const CONCURRENCY = 20;
    const TOTAL_REQUESTS = 200;
    const DELAY_MS = 50;
    const TIMEOUT_MS = 8000;

    const results = {
      success: 0,
      failed: 0,
      statusCodes: {},
      latencies: [],
      errors: []
    };

    const startTime = Date.now();

    for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
      const batch = [];
      const batchSize = Math.min(CONCURRENCY, TOTAL_REQUESTS - i);

      for (let j = 0; j < batchSize; j++) {
        batch.push(
          (async () => {
            const reqStart = Date.now();
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

              const res = await fetch(TARGET_URL, {
                method: "GET",
                signal: controller.signal,
                headers: {
                  "User-Agent": "Cloudflare-Worker-MaxLoadTest/1.0"
                }
              });

              clearTimeout(timeoutId);
              const latency = Date.now() - reqStart;

              results.latencies.push(latency);
              results.statusCodes[res.status] = (results.statusCodes[res.status] || 0) + 1;

              if (res.ok) {
                results.success++;
              } else {
                results.failed++;
              }
            } catch (err) {
              results.failed++;
              results.errors.push(err.message || String(err));
            }
          })()
        );
      }

      await Promise.all(batch);

      if (i + CONCURRENCY < TOTAL_REQUESTS) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    const totalTime = Date.now() - startTime;
    const avgLatency = results.latencies.length
      ? Math.round(results.latencies.reduce((a, b) => a + b, 0) / results.latencies.length)
      : 0;

    console.log(JSON.stringify({
      target: TARGET_URL,
      totalRequests: TOTAL_REQUESTS,
      success: results.success,
      failed: results.failed,
      successRate: ((results.success / TOTAL_REQUESTS) * 100).toFixed(1) + "%",
      avgLatencyMs: avgLatency,
      totalTimeMs: totalTime,
      statusCodes: results.statusCodes,
      sampleErrors: results.errors.slice(0, 8)
    }, null, 2));
  },

  async fetch() {
    return new Response("Cron-only max load test worker. Check logs.", { status: 200 });
  }
};
