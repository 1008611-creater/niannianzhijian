import type { AgentToolSchema } from '../../tool-schema';

export const ROUGH_CUT_TOOL_SCHEMAS: AgentToolSchema[] = [{
  name: 'assemble_rough_cut',
  description: 'Create a new editable rough-cut timeline from explicitly selected local media beats. Each beat keeps its source asset id and source in/out time. The current timeline is never changed. Optionally adds a restrained transition at each visual cut. Use search_media, view_asset_frames, and/or transcript timing to select beats before calling this tool; it does not invent footage or narration.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'New timeline name. Defaults to 粗剪.' },
      ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'], description: 'New canvas ratio. Defaults to the current timeline ratio.' },
      transition: { type: 'string', enum: ['none', 'cross-dissolve', 'soft-wipe', 'flash'], description: 'Transition between adjacent beats. Defaults to cross-dissolve.' },
      transitionDurationMs: { type: 'integer', minimum: 67, maximum: 2000, description: 'Transition duration. Defaults to 250ms.' },
      beats: {
        type: 'array',
        description: 'Ordered source selections. Every beat requires a local visual asset and an explicit sourceDurationMs.',
        items: {
          type: 'object',
          properties: {
            assetId: { type: 'string', description: 'Imported video/image/gif/svg asset id or unique prefix.' },
            sourceStartMs: { type: 'integer', minimum: 0, description: 'Source in-point in milliseconds; defaults to 0.' },
            sourceDurationMs: { type: 'integer', minimum: 250, maximum: 60000, description: 'Source duration to use in milliseconds.' },
            narration: { type: 'string', description: 'Optional approved narration for this beat. It is stored with the rough-cut clip and can later be rendered with render_rough_cut_voiceover.' },
          },
          required: ['assetId', 'sourceDurationMs'],
        },
      },
    },
    required: ['beats'],
  },
}, {
  name: 'render_rough_cut_voiceover',
  description: 'Render narration stored on the active rough-cut beats through a configured TTS provider, add the generated audio assets to the project, place them on a new anchor audio track at their matching beat starts, and persist the beat-to-voice links. This spends provider credits. It publishes nothing when a generated narration is longer than its matching visual beat. After a successful placement, call prepare_rough_cut_captions: it uses Qwen3 ForcedAligner against the generated local audio and never fabricates subtitle timing.',
  input_schema: {
    type: 'object',
    properties: {
      provider: { type: 'string', enum: ['mimo', 'openai-tts', 'elevenlabs', 'doubao', 'minimax'] },
      voiceId: { type: 'string', description: 'Provider voice id, for example the configured MiMo voice name.' },
      modelId: { type: 'string', description: 'Optional provider model override.' },
      speed: { type: 'number', minimum: 0.5, maximum: 2, description: 'Optional speaking speed.' },
      outputFormat: { type: 'string', description: 'Optional provider-supported output format.' },
      trackName: { type: 'string', description: 'Optional audio-track display name. Defaults to 旁白.' },
    },
    required: ['provider', 'voiceId'],
  },
}, {
  name: 'prepare_rough_cut_captions',
  description: 'Create or refresh the active rough-cut caption track from rendered voiceover clips by aligning each retained approved narration text to its matching generated local audio with Qwen3-ForcedAligner-0.6B. It accepts only model-returned character/word timestamps; it never calls ASR or fabricates duration-based timing. The caption track records every source voice item and source revision and refuses relinked or unverified sources.',
  input_schema: {
    type: 'object',
    properties: {
      template: { type: 'string', enum: ['plain', 'black-bar', 'persona', 'off-the-wall', 'the-french-dispatch', 'dogme', 'boyz-n-the-hood', 'bubble-pop', 'submagic', 'story', 'bili', 'luxe', 'noir', 'atelier', 'product', 'signal', 'studio', 'white-card', 'bold-outline', 'deyi-card', 'tiktok', 'netflix'], description: 'Caption visual template. Defaults to tiktok.' },
      pacing: { type: 'string', enum: ['word', 'phrase'], description: 'Caption pacing. Defaults to phrase.' },
      trackName: { type: 'string', description: 'Caption track display name when a new one is created. Defaults to 旁白字幕.' },
    },
  },
}, {
  name: 'place_rough_cut_bgm',
  description: 'Place a completed project music asset across the active rough-cut timeline. It loops/trims the music to the visual duration, puts it on a follower audio track so existing anchor narration automatically ducks it, and records the source asset/revision on every generated BGM clip. To generate new music, first use submit_music and wait for track_progress success; this tool never assumes a queued job is playable.',
  input_schema: {
    type: 'object',
    properties: {
      assetId: { type: 'string', description: 'Completed audio asset id from the project media pool (or a unique prefix).' },
      volume: { type: 'number', minimum: 0, maximum: 1, description: 'Music clip volume. Defaults to 0.18 under narration.' },
      trackName: { type: 'string', description: 'BGM track display name when creating a new track. Defaults to 背景音乐.' },
    },
    required: ['assetId'],
  },
}, {
  name: 'check_rough_cut_ready',
  description: 'Read-only structural preflight for the active rough cut. Checks visual duration, unavailable/missing sources, voice-to-caption provenance and current word-level transcripts, BGM source revisions and coverage, plus existing caption safe-area rules. It does not inspect rendered pixels or audio samples: use view_timeline_frames for visual proof and verify_export only after a completed render.',
  input_schema: { type: 'object', properties: {} },
}];

export const ROUGH_CUT_TOOL_NAMES = new Set(ROUGH_CUT_TOOL_SCHEMAS.map((tool) => tool.name));
