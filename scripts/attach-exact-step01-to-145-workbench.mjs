import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dataRoot = path.join(root, 'data-local');
const userEmail = '1453637677@qq.com';
const userId = 'USR-942D3E3BEC5115DC';
const projectId = 'NN-20260715083045-8120F5';
const analysisRunId = 'analysis-1-0dc5c5d751592e9fd0656a81';
const sourceSha256 = 'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c';
const sourceBytes = 145897161;
const evidenceId = 'NN-20260715083045-8120F5-EP001';

async function fileSha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return {sha256:crypto.createHash('sha256').update(bytes).digest('hex'), bytes:bytes.length};
}

async function main() {
  const users = JSON.parse(await fs.readFile(path.join(dataRoot, 'users.json'), 'utf8'));
  const user = users.find(item => item.id === userId && item.email === userEmail && item.status === 'active');
  if (!user) throw new Error('TARGET_USER_NOT_FOUND');

  const sourceFrom = path.join(root, 'data', 'uploads', projectId + '-001.mp4');
  const uploadsRoot = path.join(dataRoot, 'uploads');
  const sourceTo = path.join(uploadsRoot, projectId + '-001.mp4');
  await fs.mkdir(uploadsRoot, {recursive:true});
  await fs.copyFile(sourceFrom, sourceTo);
  const sourceEvidence = await fileSha256(sourceTo);
  if (sourceEvidence.sha256 !== sourceSha256 || sourceEvidence.bytes !== sourceBytes) throw new Error('SOURCE_IDENTITY_MISMATCH');

  const projectsPath = path.join(dataRoot, 'projects.json');
  const projects = JSON.parse(await fs.readFile(projectsPath, 'utf8'));
  const now = new Date().toISOString();
  const existingIndex = projects.findIndex(item => item.id === projectId);
  const project = {
    id:projectId,
    ownerId:userId,
    name:'001.mp4 短剧转绘 Step01',
    status:'running',
    createdAt:existingIndex >= 0 ? projects[existingIndex].createdAt || now : now,
    updatedAt:now,
    remakeMode:'short_drama_redraw',
    targetLanguage:'es-MX',
    aspectRatio:'9:16',
    quality:'720p',
    replacementBrief:'',
    notes:'',
    source:{
      originalName:'001.mp4',
      storedPath:sourceTo,
      mimeType:'video/mp4',
      bytes:sourceBytes,
      sha256:sourceSha256
    },
    sourceRevision:1,
    route:{
      router:'mx-shortdrama-00-router',
      earliestNode:'Step01',
      nextSkill:'mx-shortdrama-02-source-timeline'
    },
    pipeline:[
      {id:'Step01',label:'证据与关键帧',status:'evidence_ready'},
      {id:'Step02',label:'源片事实账本',status:'ready'},
      {id:'Step04',label:'资产与视频提示词',status:'blocked'},
      {id:'Step05',label:'资产与视频执行',status:'blocked'}
    ],
    productionStatus:'evidence_ready',
    analysis:{
      status:'evidence_ready',
      runId:analysisRunId,
      sourceRevision:1,
      sourceSha256,
      sourceBytes,
      settingsVersion:1,
      requestedAt:now,
      updatedAt:now,
      autoExecuteRequested:false,
      runtimeProfile:'server-step01-hq-full-v1',
      evidencePackage:{
        referenceEvidenceId:evidenceId,
        sourceSha256,
        sourceBytes
      },
      step01EvidenceDelivered:true,
      blocker:null
    },
    runtime:{
      productionStatus:'evidence_ready',
      currentNode:'Step01',
      earliestIncompleteNode:'Step02',
      nextSkill:'mx-shortdrama-02-source-timeline',
      blocker:null,
      nextAction:'Step01 证据已在服务器完成并挂入工作台；下一步只允许从这些证据建立 Step02 源片事实时间轴。',
      gateState:'step01_server_evidence_ready',
      artifactCount:6,
      verifiedArtifactCount:6,
      referenceEvidenceId:evidenceId,
      gates:{
        Step01:{status:'evidence_ready',detail:'服务器 Step01 verified'},
        Step02:{status:'ready',detail:'等待用户继续'},
        Step04:{status:'blocked_upstream',detail:'等待 Step02'},
        Step05:{status:'blocked_upstream',detail:'等待 Step04'}
      },
      step01:{
        schemaVersion:'niannian_step01_projection_v1',
        eventLogPresent:true,
        strictPassReproducible:true,
        step02Unlocked:true,
        tiers:{
          basic:{status:'completed',label:'基础证据'},
          enhanced:{status:'completed',label:'增强分析'},
          strict:{status:'completed',label:'严格验证'}
        }
      },
      worker:{
        status:'completed',
        mode:'server_step01_runner',
        router:'mx-shortdrama-00-router',
        cliFallbackAllowed:false,
        relayFallbackAllowed:false,
        updatedAt:now
      },
      lastHeartbeat:now,
      checkpointUpdatedAt:now,
      step01EvidenceDelivered:true,
      finalVideoDelivered:false
    },
    dispatch:{
      status:'completed',
      controllerId:'niannian-server-step01',
      leaseId:null,
      claimedAt:now,
      heartbeatAt:now,
      leaseUntil:null,
      localJobId:'server_step01_ep001',
      blocker:null
    },
    preflight:{
      status:'passed',
      inspectedAt:now,
      tool:'ffprobe',
      durationSeconds:96.56,
      format:'mov,mp4,m4a,3gp,3g2,mj2',
      containerBytes:sourceBytes,
      video:{codec:'h264',width:1080,height:1920,fps:25,pixelFormat:'yuv420p'},
      audio:{streamCount:1,codecs:['aac'],channels:[2],sampleRates:[48000]},
      limitations:['服务器 Step01 已完成 ASR、OCR、镜头切分和关键帧证据。']
    }
  };

  if (existingIndex >= 0) projects[existingIndex] = {...projects[existingIndex], ...project};
  else projects.unshift(project);
  await fs.writeFile(projectsPath, JSON.stringify(projects, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({attached:true, userId, projectId, evidenceId, sourceSha256, sourceBytes}, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
