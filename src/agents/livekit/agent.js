'use strict';

/**
 * agent.js
 *
 * Standalone worker entrypoint for the Sahayak LiveKit Voice Agent.
 * Run via: npm run livekit-agent
 * or directly: node src/agents/livekit/agent.js start
 */

const { cli, ServerOptions } = require('@livekit/agents');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const {
  createLiveKitAgent,
  validateLiveKitEnv,
} = require('../../services/livekitVoiceAgentService');

// Validate required environment variables before starting
try {
  validateLiveKitEnv(process.env);
} catch (err) {
  logger.error(`[LIVEKIT_AGENT] Configuration error: ${err.message}`);
  // If run as a worker script, exit early
  if (require.main === module) {
    process.exit(1);
  }
}

// Build agent instance
const agentDefinition = createLiveKitAgent({
  backendUrl: env.SAHAYAK_BACKEND_URL,
  sharedSecret: env.SAHAYAK_TOOL_SHARED_SECRET || env.SARVAM_TOOL_SHARED_SECRET,
  geminiApiKey: env.GEMINI_API_KEY,
});

// Export for LiveKit agent loader
module.exports = agentDefinition;
module.exports.default = agentDefinition;

// CLI runner when executed directly
if (require.main === module) {
  // If no subcommand is specified, default to 'start' (production worker)
  if (process.argv.length === 2) {
    process.argv.push('start');
  }

  cli.runApp(
    new ServerOptions({
      agent: __filename,
      wsURL: process.env.LIVEKIT_URL,
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
    })
  );
}
