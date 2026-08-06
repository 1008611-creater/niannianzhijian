const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const ENDPOINTS = Object.freeze({
  text:'/openapi/v2/rhart-image-g-2/text-to-image',
  image:'/openapi/v2/rhart-image-g-2/image-to-image',
  query:'/openapi/v2/query',
  upload:'/openapi/v2/media/upload/binary'
});

function adapterError(code,message,httpStatus=502){const error=new Error(message||code);error.code=code;error.httpStatus=httpStatus;return error;}
function redactMessage(value){return String(value||'').replace(/\b(?:sk|tp)-[A-Za-z0-9_-]{10,}\b/g,'[redacted]').replace(/(authorization|cookie|api[_-]?key|token|secret)\s*[:=]\s*\S+/ig,'$1=[redacted]').slice(0,500);}
function extractTaskId(value){for(const row of [value,value?.data])if(row&&typeof row==='object')for(const key of ['taskId','task_id','id'])if(['string','number'].includes(typeof row[key]))return String(row[key]);return null;}
function findImageUrls(value,output=[]){if(typeof value==='string'&&/^https?:\/\//.test(value)&&/\.(png|jpe?g|webp)(?:\?|$)/i.test(value))output.push(value);else if(Array.isArray(value))for(const row of value)findImageUrls(row,output);else if(value&&typeof value==='object')for(const row of Object.values(value))findImageUrls(row,output);return[...new Set(output)];}
function failure(value){if(findImageUrls(value).length)return null;const status=String(value?.status||value?.taskStatus||'').toLowerCase();if(['failed','failure','fail','error','rejected','cancelled','canceled'].includes(status))return 'provider_'+status;const reason=value?.failedReason||value?.errorMessage||value?.error_msg||value?.error;if(reason&&(typeof reason!=='object'||Object.keys(reason).length))return 'provider_failure';return null;}
function imageMime(bytes){if(bytes.length>12&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'image/png';if(bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return'image/webp';throw adapterError('RUNNINGHUB_OUTPUT_MEDIA_INVALID','RunningHub 返回内容不是受支持图片');}

function createRunningHubAdapter(options={}){
  const fetchImpl=options.fetchImpl||global.fetch;
  const baseUrl=String(options.baseUrl||process.env.RUNNINGHUB_BASE_URL||'https://www.runninghub.cn').replace(/\/+$/,'');
  const timeoutMs=Math.max(5000,Number(options.timeoutMs||process.env.RUNNINGHUB_REQUEST_TIMEOUT_MS||60000));
  if(!/^https:\/\//.test(baseUrl))throw adapterError('RUNNINGHUB_PROFILE_INVALID','RunningHub 地址必须使用 HTTPS',503);
  function key(){const value=String(options.apiKey||process.env.RUNNINGHUB_API_KEY||'').trim();if(!value)throw adapterError('RUNNINGHUB_CREDENTIAL_NOT_CONFIGURED','RunningHub 服务器凭据未配置',503);return value;}
  async function requestJson(endpoint,payload){let response;try{response=await fetchImpl(baseUrl+endpoint,{method:'POST',headers:{authorization:'Bearer '+key(),'content-type':'application/json',accept:'application/json','user-agent':'niannian-step03-worker/1.0'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeoutMs)});}catch(error){throw adapterError('RUNNINGHUB_NETWORK_UNCERTAIN','RunningHub 网络状态不确定：'+redactMessage(error.message));}if(!response.ok)throw adapterError('RUNNINGHUB_HTTP_'+response.status,'RunningHub 请求失败 ('+response.status+')');const value=await response.json().catch(()=>{throw adapterError('RUNNINGHUB_RESPONSE_INVALID','RunningHub 返回格式无效');});return value;}
  async function upload(filePath){const bytes=await fsp.readFile(filePath),mime=imageMime(bytes),form=new FormData();form.append('file',new Blob([bytes],{type:mime}),path.basename(filePath));let response;try{response=await fetchImpl(baseUrl+ENDPOINTS.upload,{method:'POST',headers:{authorization:'Bearer '+key(),accept:'application/json','user-agent':'niannian-step03-worker/1.0'},body:form,signal:AbortSignal.timeout(timeoutMs)});}catch(error){throw adapterError('RUNNINGHUB_UPLOAD_NETWORK_FAILED','RunningHub 参考图上传失败：'+redactMessage(error.message));}if(!response.ok)throw adapterError('RUNNINGHUB_UPLOAD_HTTP_'+response.status,'RunningHub 参考图上传失败 ('+response.status+')');const value=await response.json().catch(()=>null),data=value?.data||{},url=value?.download_url||value?.downloadUrl||value?.url||data.download_url||data.downloadUrl||data.url;if(typeof url!=='string'||!/^https?:\/\//.test(url))throw adapterError('RUNNINGHUB_UPLOAD_URL_MISSING','RunningHub 上传未返回可用引用');return url;}
  function dryRun(task,imageUrls=[]){const isImage=imageUrls.length>0,resolution=String(task.resolution||'1k').toLowerCase();if(!['1k','2k','4k'].includes(resolution))throw adapterError('RUNNINGHUB_RESOLUTION_INVALID','RunningHub 图片清晰度仅支持 1K、2K 或 4K',422);return{endpoint:isImage?ENDPOINTS.image:ENDPOINTS.text,payload:{prompt:task.prompt,imageUrls:isImage?imageUrls:undefined,aspectRatio:task.aspect_ratio||'9:16',resolution,tools:isImage?['image_generation']:undefined}};}
  async function submit(task,referenceFiles=[]){const imageUrls=[];for(const file of referenceFiles)imageUrls.push(await upload(file));const spec=dryRun(task,imageUrls),response=await requestJson(spec.endpoint,spec.payload),taskId=extractTaskId(response);if(!taskId)throw adapterError('RUNNINGHUB_TASK_ID_MISSING','RunningHub 未返回 task ID');return{taskId,payload:{endpoint:spec.endpoint,aspectRatio:spec.payload.aspectRatio,resolution:spec.payload.resolution,referenceCount:imageUrls.length,promptSha256:task.prompt_sha256}};}
  async function query(taskId){if(!/^[A-Za-z0-9._:-]{3,160}$/.test(String(taskId||'')))throw adapterError('RUNNINGHUB_TASK_ID_INVALID','RunningHub task ID 无效',422);const response=await requestJson(ENDPOINTS.query,{taskId:String(taskId)}),urls=findImageUrls(response),failed=failure(response);return{status:urls.length?'completed':failed?'failed':'generating',imageUrls:urls,errorCategory:failed};}
  async function download(url){if(typeof url!=='string'||!/^https:\/\//.test(url))throw adapterError('RUNNINGHUB_OUTPUT_URL_INVALID','RunningHub 输出地址无效');let response;try{response=await fetchImpl(url,{headers:{'user-agent':'niannian-step03-worker/1.0'},signal:AbortSignal.timeout(timeoutMs)});}catch(error){throw adapterError('RUNNINGHUB_DOWNLOAD_FAILED','RunningHub 图片下载失败：'+redactMessage(error.message));}if(!response.ok)throw adapterError('RUNNINGHUB_DOWNLOAD_HTTP_'+response.status,'RunningHub 图片下载失败 ('+response.status+')');const bytes=Buffer.from(await response.arrayBuffer()),mime=imageMime(bytes);if(bytes.length<1024)throw adapterError('RUNNINGHUB_OUTPUT_TOO_SMALL','RunningHub 图片内容异常');return{bytes,mime};}
  return{dryRun,submit,query,download,upload,constants:{baseUrl,endpoints:ENDPOINTS}};
}

module.exports={createRunningHubAdapter,extractTaskId,findImageUrls,failure,imageMime,ENDPOINTS};
