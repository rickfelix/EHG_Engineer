function hr() { return process.hrtime.bigint(); }
function ms(start, end) { return Number(end - start) / 1e6; }

async function time(label, fn) {
  const t0 = hr();
  try {
    const out = await fn();
    const t1 = hr();
    console.log(`[telemetry] ${label}: ${ms(t0,t1).toFixed(1)} ms`);
    return out;
  } catch (err) {
    const t1 = hr();
    console.log(`[telemetry] ${label}: ERROR after ${ms(t0,t1).toFixed(1)} ms`);
    throw err;
  }
}

module.exports = { time };