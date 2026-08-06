const assert = require("assert/strict");
const crypto = require("crypto");
const fsp = require("fs").promises;
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { createShotReviewService } = require("./bridge/niannian_shot_review");
const {
  createStep02Service,
  sha256,
} = require("./bridge/niannian_step02_runtime");
const { createStep03Service } = require("./bridge/niannian_step03_runtime");
const canonicalDag = require("./bridge/niannian_redraw_canonical_dag");

const projectId = "NN-20260715083045-8120F5",
  runId = "analysis-1-0dc5c5d751592e9fd0656a81",
  sourceSha =
    "a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c",
  sourceBytes = 145897161,
  owner = "USR-STEP03-HTTP-OWNER";
const expected = {
    projectId,
    analysisRunId: runId,
    sourceSha256: sourceSha,
    sourceBytes,
    evidenceId: projectId + "-EP001",
  },
  hash = (value) => crypto.createHash("sha256").update(value).digest("hex"),
  response = (value) => ({ output_text: JSON.stringify(value) });
class FixtureResponses {
  async call(body) {
    const name = body.text.format.name;
    if (name === "step02_global_context_v1")
      return response({
        character_map: [
          {
            source_identity: "原片女主",
            localized_identity: "Lucia",
            function: "推动核心冲突",
          },
        ],
        continuity_rules: ["同场人物与服装连续"],
        causality: ["冲突推动反转"],
        localization_principles: ["自然目标地区语言"],
      });
    if (name === "step02_shot_batch_v1") {
      const input = JSON.parse(body.input[0].content[0].text);
      return response({
        shots: input.shots.map((shot) => ({
          shot_id: shot.shot_id,
          source_shot_ids: [shot.shot_id],
          target_people_identity: "Lucia",
          localized_setting: "墨西哥城现代公寓",
          action: "保持原片动作、构图与节拍",
          target_dialogue: "No voy a aceptar esto.",
          chinese_back_translation: "我不会接受这件事。",
          expression_intent: "克制而坚定",
          cultural_replacements: ["称谓与机构本地化"],
          continuity_requirements: ["人物服装连续"],
          duration_fit: {
            estimated_speech_seconds: 2,
            fits: true,
            note: "适合原镜头",
          },
          structure_change: { type: "preserve", reason: "保持镜头功能" },
        })),
      });
    }
    if (["step02_whole_episode_qa_v1", "step02_confirm_qa_v1"].includes(name))
      return response({
        passed: true,
        all_source_shots_mapped: true,
        character_continuity_passed: true,
        plot_causality_passed: true,
        language_naturalness_passed: true,
        back_translation_consistent: true,
        duration_fit_passed: true,
        findings: [],
      });
    throw new Error("unexpected_fixture_call:" + name);
  }
}
function planningResult(groups, shots) {
  return {
    characters: [
      {
        character_id: "C001",
        source_identity: "原片女主",
        localized_identity: "Lucia",
        function: "推动核心冲突",
        importance: "lead",
        target_casting: "可信墨西哥职业女性",
        age_band: "25-32",
        relationship: "核心人物",
        profession: "律师",
        appearance_shot_ids: shots.map((row) => row.shot_id),
      },
    ],
    continuity_ledger: [
      {
        appearance_id: "AP-C001-01",
        character_id: "C001",
        continuity_block_id: "CB-C001-01",
        source_shot_ids: shots.map((row) => row.shot_id),
        source_wardrobe_evidence: "同一时空职业装",
        decision: "first_appearance",
        change_reason: "首次出现",
      },
    ],
    assets: [
      {
        asset_id: "A-SCENE-001",
        canonical_type: "scene",
        name: "墨西哥城公寓",
        description: "墨西哥城现代公寓",
        owner_character_id: null,
        dependencies: [],
        used_by_shots: shots.map((row) => row.shot_id),
        prompt:
          "生成墨西哥城现代公寓的写实短剧场景，不出现字幕、标题或中国文字。",
        reference_strategy: "text_to_image",
        visible_text_original: null,
        visible_text_localized: null,
      },
    ],
    group_annotations: groups.map((group) => ({
      group_id: group.group_id,
      difficulty_types: [],
      asset_ids: ["A-SCENE-001"],
      visual_goal: "保持原镜头构图和动作",
    })),
  };
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
async function waitHealth(base, child, logs) {
  for (let index = 0; index < 160; index += 1) {
    if (child.exitCode !== null)
      throw new Error("server_exited:" + logs.join(""));
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("server_timeout:" + logs.join(""));
}
async function treeDigest(root){const rows=[];async function walk(directory){for(const entry of (await fsp.readdir(directory,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))).sort((a,b)=>a.name.localeCompare(b.name))){const target=path.join(directory,entry.name);if(entry.isDirectory())await walk(target);else rows.push(path.relative(root,target)+":"+hash(await fsp.readFile(target)));}}await walk(root);return hash(rows.join("\n"));}

(async () => {
  const temp = await fsp.mkdtemp(
      path.join(os.tmpdir(), "niannian-step03-http-"),
    ),
    dataRoot = path.join(temp, "data"),
    overlayRoot = path.join(temp, "overlays"),
    step02Root = path.join(temp, "step02-runtime"),
    step03Root = path.join(temp, "step03-runtime"),
    evidenceRoot = path.join(
      __dirname,
      "data-local",
      "step01-evidence",
      projectId,
      "EP001",
    ),
    browserEvidenceRoot = path.join(
      __dirname,
      "docs",
      "agent-team",
      "evidence",
    ),
    bundle02 = path.join(
      __dirname,
      "runtime",
      "skill-bundles",
      "shortdrama-localization-runtime-1",
    ),
    bundle03 = path.join(
      __dirname,
      "runtime",
      "skill-bundles",
      "shortdrama-visual-assets-runtime-1",
    ),
    sourceName = projectId + "-001.mp4",
    sourcePath = path.join(dataRoot, "uploads", sourceName);
  const project = {
      id: projectId,
      ownerId: owner,
      name: "001 国内短剧",
      source: {
        sha256: sourceSha,
        bytes: sourceBytes,
        originalName: "001.mp4",
        mimeType: "video/mp4",
        storedPath: "D:/legacy-psyidc/uploads/" + sourceName,
        storage_key: "uploads/" + sourceName,
      },
      analysis: { runId, sourceSha256: sourceSha, status: "evidence_ready" },
    },
    token = crypto.randomBytes(32).toString("hex");
  await fsp.mkdir(path.dirname(sourcePath), { recursive: true });
  await fsp.copyFile(
    path.join(__dirname, "data-local", "uploads", sourceName),
    sourcePath,
  );
  await fsp.mkdir(browserEvidenceRoot, { recursive: true });
  await fsp.writeFile(
    path.join(dataRoot, "projects.json"),
    JSON.stringify([project]),
  );
  await fsp.writeFile(
    path.join(dataRoot, "users.json"),
    JSON.stringify([
      { id: owner, email: "owner@example.test", status: "active" },
    ]),
  );
  await fsp.writeFile(
    path.join(dataRoot, "sessions.json"),
    JSON.stringify([
      {
        id: "session-step03",
        userId: owner,
        tokenHash: hash(token),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    ]),
  );
  await fsp.writeFile(path.join(dataRoot, "script-projects.json"), "[]");
  const reviewService = createShotReviewService({
      contractRoot: path.join(__dirname, "docs", "shot-review-contract"),
      evidenceRoot,
      overlayRoot,
      expected,
    }),
    step02 = createStep02Service({
      root: step02Root,
      evidenceRoot,
      bundleRoot: bundle02,
      shotReviewService: reviewService,
      responsesClient: new FixtureResponses(),
      expected,
    });
  const review = await reviewService.getReview({
      ownerId: owner,
      project,
      analysisRunId: runId,
    }),
    { snapshot } = await step02.confirmStep01({
      ownerId: owner,
      project,
      analysisRunId: runId,
      ifMatch: review.etag,
      confirmedBy: owner,
    }),
    createdVariant = await step02.createVariant({
      ownerId: owner,
      project,
      locale: "es-MX",
      idempotencyKey: sha256(
        [projectId, snapshot.snapshot_sha256, "es-MX", "whole_episode_v1"].join(
          ":",
        ),
      ),
    });
  let variant;
  for (let index = 0; index < 120; index += 1) {
    variant = await step02.getVariant({
      ownerId: owner,
      project,
      variantId: createdVariant.variant_id,
    });
    if (variant.status === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  variant = await step02.confirmVariant({
    ownerId: owner,
    project,
    variantId: createdVariant.variant_id,
    ifMatch: variant.etag,
  });
  assert.equal(variant.status, "confirmed");
  project.step02={status:"accepted",acceptance:{status:"accepted",downstream_consumable:true,sha256:variant.confirmed_sha256,semanticSha256:variant.confirmed_sha256,variantId:variant.variant_id}};
  project.productionStatus="step02_accepted";
  project.canonical=canonicalDag.resolveCanonicalState({legacy:{step:"Step02"},authority_revision:runId,current_authority_revision:runId,input_contract:{S01_EVIDENCE:true},output_contract:{accepted:true,artifact_ledger_verified:true}});
  await fsp.writeFile(path.join(dataRoot,"projects.json"),JSON.stringify([project]));
  const step03 = createStep03Service({
      root: step03Root,
      evidenceRoot,
      step01SourceLedgerOverlayRoot: path.join(temp, "step01-ledger-overlays"),
      bundleRoot: bundle03,
      step02Service: step02,
      expected,
    }),
    createdPlan = await step03.createPlan({
      ownerId: owner,
      project,
      locale: "es-MX",
      step02VariantId: variant.variant_id,
      idempotencyKey: "step03-http-plan-001",
    }),
    claim = await step03.claimNextTask({ workerId: "fixture-worker" });
  await step03.updateWorkerTask({
    directory: claim.directory,
    taskId: claim.task.task_id,
    patch: {
      status: "accepted",
      planning_result: planningResult(createdPlan.plan.groups, variant.shots),
    },
  });
  let planned = await step03.getPlan({
    ownerId: owner,
    project,
    planId: createdPlan.plan.plan_id,
  });
  assert.equal(planned.status, "character_review");
  const recommendedStyle = planned.style_review.candidates.find((row) => row.recommended);
  planned = (await step03.confirmStyle({
    ownerId: owner,
    project,
    planId: planned.plan_id,
    styleId: recommendedStyle.style_id,
    candidateSha256: recommendedStyle.candidate_sha256,
    ifMatch: planned.etag,
  })).plan;
  const queuedCharacter = await step03.queueCharacterCandidates({
      ownerId: owner,
      project,
      planId: planned.plan_id,
      characterId: "C001",
      idempotencyKey: "step03-http-character-001",
      ifMatch: planned.etag,
    }),
    characterClaim = await step03.claimNextTask({ workerId: "fixture-worker" }),
    boardBytes = await fsp.readFile(
      path.join(
        __dirname,
        "assets",
        "home",
        "niannian-hero-oil-paint-quiet-v1.png",
      ),
    ),
    boardSha = hash(boardBytes),
    boardId = "ART-" + boardSha.slice(0, 24),
    boardKey = "artifacts/" + boardId + ".png",
    boardPath = path.join(characterClaim.directory, ...boardKey.split("/"));
  await fsp.mkdir(path.dirname(boardPath), { recursive: true });
  await fsp.writeFile(boardPath, boardBytes);
  await step03.updateWorkerTask({
    directory: characterClaim.directory,
    taskId: characterClaim.task.task_id,
    patch: {
      status: "accepted",
      artifact_id: boardId,
      artifact_key: boardKey,
      artifact_sha256: boardSha,
      artifact_bytes: boardBytes.length,
      artifact_mime: "image/png",
      qa: { passed: true },
    },
  });
  planned = await step03.getPlan({
    ownerId: owner,
    project,
    planId: createdPlan.plan.plan_id,
  });
  assert.equal(planned.characters[0].status, "awaiting_confirmation");
  assert.equal(queuedCharacter.result.queued, 1);
  const port = await freePort(),
    base = "http://127.0.0.1:" + port,
    logs = [],
    child = spawn(process.execPath, ["server.js"], {
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataRoot,
        NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT: evidenceRoot,
        NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT: overlayRoot,
        NIANNIAN_STEP02_RUNTIME_ROOT: step02Root,
        NIANNIAN_STEP03_RUNTIME_ROOT: step03Root,
        NIANNIAN_STEP03_SKILL_BUNDLE_ROOT: bundle03,
        NIANNIAN_MEDIA_PREFLIGHT: "off",
        NIANNIAN_STEP01_AUTO_EXECUTE: "off",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  let browser;
  try {
    await waitHealth(base, child, logs);
    const anonymous = await fetch(
      base + "/api/projects/" + projectId + "/step03/plans?locale=es-MX",
    );
    assert.equal(anonymous.status, 401);
    const headers = { cookie: "niannian_session=" + token },
      api = await fetch(
        base +
          "/api/projects/" +
          projectId +
          "/step03/plans/" +
          planned.plan_id,
        { headers },
      ),
      apiText = await api.text();
    assert.equal(api.status, 200);
    const projectsFile=path.join(dataRoot,"projects.json"),boundProjects=JSON.parse(await fsp.readFile(projectsFile,"utf8"));boundProjects[0].step02.acceptance.semanticSha256="c".repeat(64);await fsp.writeFile(projectsFile,JSON.stringify(boundProjects));
    const mismatchedCandidate=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/candidate",{method:"POST",headers:{...headers,"Content-Type":"application/json","Idempotency-Key":"mismatched-legacy-variant"},body:JSON.stringify({variant_id:variant.variant_id})});assert.equal(mismatchedCandidate.status,409);
    boundProjects[0].step02.acceptance.semanticSha256=variant.confirmed_sha256;await fsp.writeFile(projectsFile,JSON.stringify(boundProjects));
    const candidateResponse=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/candidate",{method:"POST",headers:{...headers,"Content-Type":"application/json","Idempotency-Key":variant.confirmed_sha256},body:JSON.stringify({variant_id:variant.variant_id})}),candidateBody=await candidateResponse.json(),localizationCandidate=candidateBody.localization,localizationRevision=candidateResponse.headers.get("x-localization-revision");
    assert.equal(localizationCandidate.candidate.localization_revision,localizationRevision);
    assert.equal(candidateResponse.status,201);assert.equal(localizationCandidate.candidate.status,"candidate");assert.equal(localizationCandidate.downstream_ready,false);
    const localizationRead=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation",{headers}),localizationBody=await localizationRead.json(),localizationEtag=localizationRead.headers.get("etag");
    assert.equal(localizationRead.status,200);assert.equal(localizationBody.localization.downstream_ready,false);assert.ok(localizationEtag);
    assert.doesNotMatch(JSON.stringify(localizationBody),/localization_revision|authority_revision|"etag"|provider|receipt|internal_path/i);
    const confirmationFile=path.join(dataRoot,"localization-confirmation","store.json"),beforeFailedConfirm=await fsp.readFile(confirmationFile,"utf8");
    const missingMatch=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/confirm",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({localization_revision:localizationRevision})});
    assert.equal(missingMatch.status,428);assert.equal(await fsp.readFile(confirmationFile,"utf8"),beforeFailedConfirm);
    const weakMatch=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/confirm",{method:"POST",headers:{...headers,"Content-Type":"application/json","If-Match":"W/"+localizationEtag},body:JSON.stringify({localization_revision:localizationRevision})});
    assert.equal(weakMatch.status,412);assert.equal(await fsp.readFile(confirmationFile,"utf8"),beforeFailedConfirm);
    const beforeBlockedPlan=await treeDigest(step03Root);
    const blockedPlan=await fetch(base+"/api/projects/"+projectId+"/step03/plans",{method:"POST",headers:{...headers,"Content-Type":"application/json","Idempotency-Key":"step03-http-plan-001"},body:JSON.stringify({locale:"es-MX",step02_variant_id:variant.variant_id})});
    assert.equal(blockedPlan.status,409);assert.equal(await treeDigest(step03Root),beforeBlockedPlan,"unconfirmed plan request must be no-write");
    assert.doesNotMatch(
      apiText,
      /provider_task_id|artifact_path|authorization|cookie|runninghub_api_key|krill_codex_api_key/i,
    );
    const sourceHead = await fetch(
      base + "/api/projects/" + projectId + "/source",
      { method: "HEAD", headers },
    );
    assert.equal(sourceHead.status, 200);
    assert.equal(sourceHead.headers.get("content-length"), String(sourceBytes));
    assert.equal(sourceHead.headers.get("x-content-sha256"), sourceSha);
    const sourceRange = await fetch(
      base + "/api/projects/" + projectId + "/source",
      { headers: { ...headers, range: "bytes=0-1023" } },
    );
    assert.equal(sourceRange.status, 206);
    assert.equal(
      sourceRange.headers.get("content-range"),
      "bytes 0-1023/" + sourceBytes,
    );
    assert.equal((await sourceRange.arrayBuffer()).byteLength, 1024);
    const artifactEndpoint =
        base +
        "/api/projects/" +
        projectId +
        "/step03/plans/" +
        planned.plan_id +
        "/artifacts/" +
        boardId,
      artifactHead = await fetch(artifactEndpoint, { method: "HEAD", headers });
    assert.equal(artifactHead.status, 200);
    assert.equal(
      artifactHead.headers.get("content-length"),
      String(boardBytes.length),
    );
    assert.equal(artifactHead.headers.get("x-content-sha256"), boardSha);
    const artifactGet = await fetch(artifactEndpoint, { headers });
    assert.equal(artifactGet.status, 200);
    assert.equal(
      (await artifactGet.arrayBuffer()).byteLength,
      boardBytes.length,
    );
    const previewHead = await fetch(artifactEndpoint + "?view=preview&width=1280", {
      method: "HEAD",
      headers,
    });
    if (previewHead.status !== 200) {
      const previewFailure = await fetch(artifactEndpoint + "?view=preview&width=1280", {headers});
      throw new Error("preview_failed:" + previewFailure.status + ":" + await previewFailure.text());
    }
    assert.equal(previewHead.headers.get("content-type"), "image/webp");
    assert.equal(previewHead.headers.get("x-source-sha256"), boardSha);
    assert.ok(Number(previewHead.headers.get("content-length")) < boardBytes.length);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies([
      { name: "niannian_session", value: token, url: base },
    ]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/#redraw/" + projectId + "/stage/02", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector(".step02-region-gate", { timeout: 20000 });
    assert.equal(await page.locator(".step02-region-choice").count(), 3);
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-region-gate-desktop.png"),
    });
    await page.click('[data-enter-step02-market="es-MX"]');
    await page.waitForURL(/stage\/02\/market\/es-MX/);
    await page.waitForSelector("[data-confirm-localization]", { timeout: 20000 });
    const localizationText=await page.locator(".localization-confirmation-panel").innerText();
    for(const visible of ["角色姓名与关系","中文剧情大纲","本土化关键对白","地点、货币、称呼与文化替换","待确认项"])assert.match(localizationText,new RegExp(visible));
    assert.doesNotMatch(localizationText,/provider|receipt|authority_revision|localization_revision|[a-f0-9]{64}|\\\\|:\\/i);
    assert.equal(await page.locator("[data-confirm-localization]").count(),1);
    await page.locator("[data-confirm-localization]").focus();assert.equal(await page.evaluate(()=>document.activeElement?.hasAttribute('data-confirm-localization')),true);await page.keyboard.press("Enter");
    await page.waitForSelector("[data-enter-step03]", { timeout: 20000 });
    const confirmedRead=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation",{headers}),confirmedBody=await confirmedRead.json();
    assert.equal(confirmedBody.localization.downstream_ready,true);
    const confirmedRevision=confirmedRead.headers.get("x-localization-revision");
    const allowedPlan=await fetch(base+"/api/projects/"+projectId+"/step03/plans",{method:"POST",headers:{...headers,"Content-Type":"application/json","Idempotency-Key":"step03-http-plan-001","X-Localization-Revision":confirmedRevision},body:JSON.stringify({locale:"es-MX",step02_variant_id:variant.variant_id,localization_revision:confirmedRevision})});
    const allowedPlanText=await allowedPlan.text(),allowedPlanBody=JSON.parse(allowedPlanText);assert.equal(allowedPlan.status,409);assert.equal(allowedPlanBody.code,"STEP03_ROLE_AUTHORITY_REQUIRED","confirmed localization must pass to the next independent runtime gate");
    await page.setViewportSize({width:390,height:844});
    const localizationMobile=await page.evaluate(()=>({innerWidth,scrollWidth:document.scrollingElement.scrollWidth,buttonHeight:document.querySelector('[data-enter-step03]')?.getBoundingClientRect().height||0,liveErrors:[...document.querySelectorAll('[role="alert"]')].map(node=>node.textContent)}));
    assert.ok(localizationMobile.scrollWidth<=localizationMobile.innerWidth,JSON.stringify(localizationMobile));assert.ok(localizationMobile.buttonHeight>=44,JSON.stringify(localizationMobile));
    await page.screenshot({path:path.join(browserEvidenceRoot,"localization-confirmation-mobile.png"),fullPage:true});
    await page.setViewportSize({width:1440,height:900});
    await page.click("[data-enter-step03]");
    await page.waitForURL(/stage\/03\/market\/es-MX/);
    await page.waitForSelector(".step03-style-workspace", { timeout: 20000 });
    assert.equal(await page.locator("[data-step03-substep]").count(), 5);
    assert.equal(await page.locator("[data-step03-style-choice]").count(), 3);
    assert.match(await page.locator(".step03-style-workspace").innerText(),/写实真人短剧/);
    for(const viewport of [{width:1440,height:900,name:"desktop"},{width:1366,height:768,name:"compact"},{width:390,height:844,name:"mobile"}]){await page.setViewportSize({width:viewport.width,height:viewport.height});const metrics=await page.evaluate(()=>({innerWidth,scrollWidth:document.scrollingElement.scrollWidth}));assert.ok(metrics.scrollWidth<=metrics.innerWidth,JSON.stringify({viewport,...metrics}));await page.screenshot({path:path.join(browserEvidenceRoot,"redraw-style-review-"+viewport.name+".png"),fullPage:false});}
    await page.setViewportSize({width:1440,height:900});
    await page.click('[data-step03-substep="characters"]');
    await page.waitForFunction(() => document.querySelector(".step03-stage")?.textContent.includes("Lucia"),null,{ timeout: 20000 });
    await page.waitForFunction(
      () => {
        const image = document.querySelector("[data-step03-image]");
        return (
          image && image.naturalWidth === 1280 && image.naturalHeight === 720
        );
      },
      null,
      { timeout: 20000 },
    );
    await page.evaluate(() => {
      document.querySelector("[data-step03-image]").src =
        "/api/test-intentional-missing-image.png";
    });
    await page.waitForSelector(".step03-image-empty.is-error", {
      timeout: 20000,
    });
    assert.equal(
      await page.locator("[data-step03-character-accept]").isDisabled(),
      true,
      "unreadable character media must not be confirmable",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".step03-style-workspace", { timeout: 20000 });
    await page.click('[data-step03-substep="characters"]');
    await page.waitForFunction(
      () =>
        document.querySelector(".step03-stage")?.textContent.includes("Lucia"),
      null,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => {
        const image = document.querySelector("[data-step03-image]");
        return (
          image && image.naturalWidth === 1280 && image.naturalHeight === 720
        );
      },
      null,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => {
        const video = document.querySelector("[data-step03-source-video]");
        return (
          video &&
          video.videoWidth === 1080 &&
          video.videoHeight === 1920 &&
          video.duration > 0
        );
      },
      null,
      { timeout: 20000 },
    );
    await page.waitForFunction(
      () => !document.querySelector("[data-step03-character-accept]")?.disabled,
      null,
      { timeout: 20000 },
    );
    assert.equal(
      await page.locator("[data-step03-character-accept]").isEnabled(),
      true,
    );
    const mediaLayout = await page.evaluate(() => {
      const video = document.querySelector("[data-step03-source-video]"),
        board = document.querySelector(
          ".step03-character-board>.step03-media-open",
        ),
        image = document.querySelector("[data-step03-image]");
      return {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        videoRatio:
          video.getBoundingClientRect().width /
          video.getBoundingClientRect().height,
        boardRatio:
          board.getBoundingClientRect().width /
          board.getBoundingClientRect().height,
        imageFit: getComputedStyle(image).objectFit,
        promptExposed: document.body.textContent.includes("[模板版本]"),
      };
    });
    assert.equal(mediaLayout.videoWidth, 1080);
    assert.equal(mediaLayout.videoHeight, 1920);
    assert.equal(mediaLayout.imageWidth, 1280);
    assert.equal(mediaLayout.imageHeight, 720);
    assert.ok(
      Math.abs(mediaLayout.videoRatio - 9 / 16) < 0.03,
      JSON.stringify(mediaLayout),
    );
    assert.equal(mediaLayout.imageFit, "contain", JSON.stringify(mediaLayout));
    assert.equal(mediaLayout.promptExposed, false);
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-characters-desktop.png"),
    });
    await page.click('[data-step03-substep="assets"]');
    assert.match(
      await page.locator(".step03-workspace").innerText(),
      /需先确认 1 位重要角色/,
    );
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-assets-desktop.png"),
    });
    await page.click('[data-step03-substep="firstframes"]');
    assert.match(
      await page.locator(".step03-workspace").innerText(),
      /首帧尚未生成/,
    );
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-firstframes-desktop.png"),
    });
    await page.click('[data-step03-substep="confirmation"]');
    assert.match(
      await page.locator(".step03-workspace").innerText(),
      /尚未生成|尚未确认/,
    );
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-confirmation-desktop.png"),
    });
    const desktop = await page.evaluate(() => ({
      innerHeight,
      scrollHeight: document.scrollingElement.scrollHeight,
      innerWidth,
      scrollWidth: document.scrollingElement.scrollWidth,
    }));
    assert.ok(
      desktop.scrollHeight <= desktop.innerHeight,
      JSON.stringify(desktop),
    );
    assert.ok(
      desktop.scrollWidth <= desktop.innerWidth,
      JSON.stringify(desktop),
    );
    await page.click('[data-step03-substep="characters"]');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-step03-image]")?.naturalWidth === 1280,
      null,
      { timeout: 20000 },
    );
    const medium = await page.evaluate(() => {
      const image = document
          .querySelector("[data-step03-image]")
          .getBoundingClientRect(),
        board = document
          .querySelector(".step03-character-board>.step03-media-open")
          .getBoundingClientRect();
      return {
        imageHeight: image.height,
        boardHeight: board.height,
        scrollWidth: document.scrollingElement.scrollWidth,
        innerWidth,
      };
    });
    assert.ok(
      medium.imageHeight <= medium.boardHeight + 0.5,
      JSON.stringify(medium),
    );
    assert.ok(medium.scrollWidth <= medium.innerWidth, JSON.stringify(medium));
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(
      base + "/#redraw/" + projectId + "/stage/03/market/es-MX",
      { waitUntil: "domcontentloaded" },
    );
    await mobile.waitForSelector(".step03-style-workspace", { timeout: 20000 });
    await mobile.click('[data-step03-substep="characters"]');
    await mobile.waitForFunction(
      () =>
        document.querySelector(".step03-stage")?.textContent.includes("Lucia"),
      null,
      { timeout: 20000 },
    );
    await mobile.waitForFunction(
      () =>
        document.querySelector("[data-step03-image]")?.naturalWidth === 1280,
      null,
      { timeout: 20000 },
    );
    await mobile.screenshot({
      path: path.join(browserEvidenceRoot, "step03-characters-mobile.png"),
    });
    const mobileSize = await mobile.evaluate(() => ({
      innerWidth,
      scrollWidth: document.scrollingElement.scrollWidth,
      touchTargets: [
        ...document.querySelectorAll(".step03-stage button"),
      ].every((node) => {
        const height = node.getBoundingClientRect().height;
        return height === 0 || height >= 44;
      }),
      badTouchTargets: [...document.querySelectorAll(".step03-stage button")]
        .filter((node) => {
          const height = node.getBoundingClientRect().height;
          return height > 0 && height < 44;
        })
        .map((node) => ({
          text: node.textContent.trim().slice(0, 40),
          className: node.className,
          height: node.getBoundingClientRect().height,
          disabled: node.disabled,
        })),
    }));
    assert.ok(
      mobileSize.scrollWidth <= mobileSize.innerWidth,
      JSON.stringify(mobileSize),
    );
    assert.equal(mobileSize.touchTargets, true, JSON.stringify(mobileSize));
    assert.deepEqual(errors, []);
    const firstShot=variant.shots[0],beforeRejectedEdit=await fsp.readFile(confirmationFile),rejectedEdit=await fetch(base+"/api/projects/"+projectId+"/step02/variants/"+encodeURIComponent(variant.variant_id)+"/shots/"+encodeURIComponent(firstShot.shot_id)+"/revisions",{method:"POST",headers:{...headers,"Content-Type":"application/json","If-Match":"W/\"rejected\""},body:JSON.stringify({revision_id:"localization-http-rejected-edit",base_revision:firstShot.active_revision||null,patch:{manual_notes:"不得落盘"}})});
    assert.equal(rejectedEdit.status,409);assert.deepEqual(await fsp.readFile(confirmationFile),beforeRejectedEdit,"rejected Step02 mutation must not stale localization confirmation");
    const stillConfirmedAfterRejectedEdit=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation",{headers}),stillConfirmedBody=await stillConfirmedAfterRejectedEdit.json();assert.equal(stillConfirmedBody.localization.downstream_ready,true);
    const edit=await fetch(base+"/api/projects/"+projectId+"/step02/variants/"+encodeURIComponent(variant.variant_id)+"/shots/"+encodeURIComponent(firstShot.shot_id)+"/revisions",{method:"POST",headers:{...headers,"Content-Type":"application/json","If-Match":variant.etag},body:JSON.stringify({revision_id:"localization-http-edit-001",base_revision:firstShot.active_revision||null,patch:{manual_notes:"用户已修改地区改编字段"}})});
    assert.equal(edit.status,201);const staleAfterEdit=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation",{headers}),staleAfterEditBody=await staleAfterEdit.json();assert.equal(staleAfterEditBody.localization.downstream_ready,false);
    const beforeStaleMutation=await treeDigest(step03Root),staleMutation=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/assets/generate",{method:"POST",headers:{...headers,"Content-Type":"application/json","If-Match":planned.etag,"Idempotency-Key":"stale-localization-asset-001","X-Localization-Revision":confirmedRevision},body:JSON.stringify({asset_ids:["A-SCENE-001"],localization_revision:confirmedRevision})});
    assert.equal(staleMutation.status,409);assert.equal(await treeDigest(step03Root),beforeStaleMutation,"stale localization must block S05A with no write");
    process.stdout.write(
      JSON.stringify({
        ok: true,
        level: "integrated_http_ui",
        region_gate: 3,
        market_route: true,
        step03_substeps: 5,
        owner_auth: true,
        public_secret_redaction: true,
        source_head: true,
        source_range_206: true,
        artifact_head: true,
        artifact_get: true,
        source_video: "1080x1920",
        character_board_preview: "1280x720-webp",
        media_confirmation_gate: true,
        desktop_one_viewport: true,
        mobile_no_horizontal_overflow: true,
        mobile_touch_targets: true,
        evidence_screenshots: 6,
      }) + "\n",
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2000).unref();
    });
    await fsp.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
