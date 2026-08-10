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
    label: '动作迁移'
  })
});

const ALIASES = Object.freeze({
  h3: 'h3',
  'minimax-h3': 'h3',
  'animate-transfer': 'animate-transfer',
  'animate-motion-transfer': 'animate-transfer',
  'runninghub-animate': 'animate-transfer',
  'runninghub-animate-motion-transfer': 'animate-transfer'
});

function clean(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveVideoChannel(value) {
  const id = ALIASES[clean(value) || 'h3'];
  return id ? CHANNELS[id] : null;
}

module.exports = {CHANNELS, resolveVideoChannel};
