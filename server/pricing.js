// Claude API list prices in USD per million tokens (Claude API, 2026-10). Update here when Anthropic changes prices.
// Cache writes (5-minute TTL) cost 1.25x input; cache reads cost 0.1x input.
const MODELS = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, longInput: 0.50, longOutput: 2.50, longAbove: 100000 },
  'claude-sonnet-5-5': { input: 2.00, output: 10.00 },
};

function costUSD(model, usage = {}) {
  const p = MODELS[model];
  if (!p) return 0;
  const input = usage.input_tokens || 0;
  const write = usage.cache_creation_input_tokens || 0;
  const read = usage.cache_read_input_tokens || 0;
  const output = usage.output_tokens || 0;
  const long = p.longAbove && input + write + read > p.longAbove;
  const inRate = (long ? p.longInput : p.input) / 1e6;
  const outRate = (long ? p.longOutput : p.output) / 1e6;
  return input * inRate + write * inRate * 1.25 + read * inRate * 0.1 + output * outRate;
}

module.exports = { MODELS, costUSD };
