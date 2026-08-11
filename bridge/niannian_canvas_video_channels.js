'use strict';

const CHANNELS = Object.freeze({
  h3: Object.freeze({
    id: 'h3',
    model: 'minimax-h3',
    label: 'H3 生视频'
  }),
  'animate-transfer': Object.freeze({
    id: 'animate-transfer',
    model: 'runninghub-animate-motion-transfer',
    label: '动作迁移（工作流）'
  }),
  'animate-ai-app': Object.freeze({
    id: 'animate-ai-app',
    model: 'runninghub-animate-ai-app',
    label: '动作迁移（AI 应用）'
  })
});

const ALIASES = Object.freeze({
  h3: 'h3',
  'minimax-h3': 'h3',
  'animate-transfer': 'animate-transfer',
  'animate-motion-transfer': 'animate-transfer',
  'runninghub-animate': 'animate-transfer',
  'runninghub-animate-motion-transfer': 'animate-transfer',
  'animate-ai-app': 'animate-ai-app',
  'runninghub-animate-ai-app': 'animate-ai-app'
});

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveVideoChannel(value) {
  const id = ALIASES[clean(value) || 'h3'];
  return id ? CHANNELS[id] : null;
}

function isAnimateVideoChannel(value) {
  const channel = typeof value === 'object' && value ? value.id : resolveVideoChannel(value);
  return channel?.id === 'animate-transfer' || channel?.id === 'animate-ai-app';
}

module.exports = {CHANNELS, resolveVideoChannel, isAnimateVideoChannel};
