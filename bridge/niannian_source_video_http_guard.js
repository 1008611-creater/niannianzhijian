'use strict';

function guardError(code){const error=new Error(code);error.code=code;error.httpStatus=403;return error;}
function validatePaidMutationRequest(request){
  const host=String(request.headers.host||'').trim().toLowerCase(),forwarded=String(request.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase(),protocol=forwarded||'http',expected=protocol+'://'+host,origin=String(request.headers.origin||'').trim().toLowerCase(),fetchSite=String(request.headers['sec-fetch-site']||'').trim().toLowerCase();
  if(!host||!origin)throw guardError('SOURCE_VIDEO_CSRF_ORIGIN_REQUIRED');
  if(origin!==expected)throw guardError('SOURCE_VIDEO_CSRF_ORIGIN_MISMATCH');
  if(fetchSite!=='same-origin')throw guardError('SOURCE_VIDEO_CSRF_FETCH_SITE_INVALID');
  return{origin_verified:true,fetch_site_verified:true,expected_origin:expected};
}
module.exports={validatePaidMutationRequest};
