const CHANNELS = Object.freeze({
  text: Object.freeze({endpoint:'/openapi/v2/run/workflow/2084079636237078529',referenceNodes:[],promptNode:'5',controlNode:'4'}),
  'one-image': Object.freeze({endpoint:'/openapi/v2/run/workflow/2085388519102570497',referenceNodes:['4'],promptNode:'7',controlNode:'6'}),
  'last-frame': Object.freeze({endpoint:'/openapi/v2/run/workflow/2084071981670035457',referenceNodes:['4'],promptNode:'7',controlNode:'6'}),
  'first-last': Object.freeze({endpoint:'/openapi/v2/run/workflow/2084070256573767682',referenceNodes:['6','4'],promptNode:'8',controlNode:'7'}),
  'multi-image': Object.freeze({endpoint:'/openapi/v2/run/workflow/2084117309760823297',referenceNodes:['4','19','20'],promptNode:'7',controlNode:'6'}),
  'four-image': Object.freeze({endpoint:'/openapi/v2/run/workflow/2084692763471335426',referenceNodes:['4','19','20','21'],promptNode:'7',controlNode:'6'})
});

function chooseChannel(referenceCount) {
  const count = Number(referenceCount || 0);
  if (count === 0) return 'text';
  if (count === 1) return 'one-image';
  if (count === 2) return 'first-last';
  if (count === 3) return 'multi-image';
  if (count === 4) return 'four-image';
  throw Object.assign(new Error('H3 首版最多支持四张项目参考图'), {code:'CANVAS_H3_REFERENCE_COUNT_UNSUPPORTED',httpStatus:422});
}

module.exports = {CHANNELS,chooseChannel};
