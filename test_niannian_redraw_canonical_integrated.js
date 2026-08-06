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
const step01SourceLedger = require("./bridge/niannian_step01_source_ledger");
const step01RoleCardAuthority = require("./bridge/niannian_step01_role_card_authority");

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

(async () => {
  const temp = await fsp.mkdtemp(
      path.join(os.tmpdir(), "niannian-step03-http-"),
    ),
    dataRoot = path.join(temp, "data"),
    overlayRoot = path.join(temp, "overlays"),
    step02Root = path.join(temp, "step02-runtime"),
    step03Root = path.join(temp, "step03-runtime"),
    roleCardRoot = path.join(temp, "step01-role-card-authority"),
    evidenceRoot = path.join(
      __dirname,
      "data-local",
      "step01-evidence",
      projectId,
      "EP001",
    ),
    browserEvidenceRoot = path.join(__dirname,"docs","agent-team","legacy-canonical-dag-20260727","evidence"),
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
  const sourceLedger=await step01SourceLedger.readLedger({evidenceRoot,overlayRoot:path.join(temp,"step01-ledger-overlays"),project});
  await step01RoleCardAuthority.generate({root:roleCardRoot,project,ledger:sourceLedger,story:null,fullEvidenceIndex:null});
  const step03 = createStep03Service({
      root: step03Root,
      evidenceRoot,
      step01SourceLedgerOverlayRoot: path.join(temp, "step01-ledger-overlays"),
      bundleRoot: bundle03,
      step02Service: step02,
      roleCardService:step01RoleCardAuthority,
      roleCardRoot,
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
  const port = await freePort(),base = "http://127.0.0.1:" + port,logs = [],serverEnv={
        ...process.env,
        PORT: String(port),
        DATA_DIR: dataRoot,
        NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT: evidenceRoot,
        NIANNIAN_SHOT_REVIEW_OVERLAY_ROOT: overlayRoot,
        NIANNIAN_STEP02_RUNTIME_ROOT: step02Root,
        NIANNIAN_STEP03_RUNTIME_ROOT: step03Root,
        NIANNIAN_STEP03_SKILL_BUNDLE_ROOT: bundle03,
        NIANNIAN_STEP01_ROLE_CARD_AUTHORITY_ROOT:roleCardRoot,
        NIANNIAN_MEDIA_PREFLIGHT: "off",
        NIANNIAN_STEP01_AUTO_EXECUTE: "off",
      };
  let child = spawn(process.execPath, ["server.js"], {
       cwd: __dirname,
       env:serverEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  let browser;
  try {
    await waitHealth(base, child, logs);
    const sessionHeaders={cookie:"niannian_session="+token,"content-type":"application/json"};
    const confirmedByHttp=await fetch(base+"/api/projects/"+projectId+"/step02/variants/"+encodeURIComponent(variant.variant_id)+"/confirm",{method:"POST",headers:{...sessionHeaders,"if-match":variant.etag},body:"{}"});
    assert.equal(confirmedByHttp.status,200);
    const durableProjects=JSON.parse(await fsp.readFile(path.join(dataRoot,"projects.json"),"utf8"));
    const durableProject=durableProjects.find(row=>row.id===projectId);
    assert.equal(durableProject.productionStatus,"step02_accepted");
    assert.equal(durableProject.canonical.canonical_node_id,"S02_SOURCE_TIMELINE");
    assert.equal(durableProject.canonical.downstream_gate.eligible,true);
    assert.equal(durableProject.route.earliestNode,"Step04");
    assert.equal(durableProject.step02.acceptance.status,"accepted");
    assert.equal(durableProject.step02.acceptance.downstream_consumable,true);
    const localizationCandidate=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/candidate",{method:"POST",headers:{...sessionHeaders,"idempotency-key":"canonical-localization-candidate"},body:JSON.stringify({variant_id:variant.variant_id})});
    assert.ok([200,201].includes(localizationCandidate.status));
    const localizationPayload=await localizationCandidate.json();
    const localizationRevision=localizationPayload.localization.candidate.localization_revision;
    const localizationConfirmed=await fetch(base+"/api/projects/"+projectId+"/localization-confirmation/confirm",{method:"POST",headers:{...sessionHeaders,"if-match":localizationCandidate.headers.get("etag")},body:JSON.stringify({localization_revision:localizationRevision})});
    assert.equal(localizationConfirmed.status,200);
    let httpPlanResponse=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id,{headers:sessionHeaders});
    let httpPlan=(await httpPlanResponse.json()).plan;
    const planDirectory=claim.directory,statePath=path.join(planDirectory,"state.json");
    const stateBeforeDependency=await fsp.readFile(statePath);
    const projectBeforeDependency=await fsp.readFile(path.join(dataRoot,"projects.json"));
    const dependencyBlocked=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/firstframes/generate",{method:"POST",headers:{...sessionHeaders,"if-match":httpPlan.etag,"idempotency-key":"canonical-firstframe-before-assets"},body:JSON.stringify({group_ids:httpPlan.groups.map(row=>row.group_id),localization_revision:localizationRevision})});
    assert.equal(dependencyBlocked.status,409);
    assert.deepEqual(await fsp.readFile(statePath),stateBeforeDependency);
    assert.deepEqual(await fsp.readFile(path.join(dataRoot,"projects.json")),projectBeforeDependency);
    const assetsQueued=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/assets/generate",{method:"POST",headers:{...sessionHeaders,"if-match":httpPlan.etag,"idempotency-key":"canonical-assets-http"},body:JSON.stringify({asset_ids:httpPlan.assets.map(row=>row.asset_id),localization_revision:localizationRevision})});
    assert.equal(assetsQueued.status,200,await assetsQueued.clone().text());
    httpPlan=(await assetsQueued.json()).plan;
    const assetClaim=await step03.claimNextTask({workerId:"canonical-fixture-worker"});
    const assetBytes=Buffer.from("canonical-http-asset"),assetSha=hash(assetBytes),assetId="ART-"+assetSha.slice(0,24),assetKey="artifacts/"+assetId+".png",assetPath=path.join(assetClaim.directory,...assetKey.split("/"));
    await fsp.mkdir(path.dirname(assetPath),{recursive:true});await fsp.writeFile(assetPath,assetBytes);
    await step03.updateWorkerTask({directory:assetClaim.directory,taskId:assetClaim.task.task_id,patch:{status:"accepted",artifact_id:assetId,artifact_key:assetKey,artifact_sha256:assetSha,artifact_bytes:assetBytes.length,artifact_mime:"image/png",qa:{passed:true}}});
    httpPlanResponse=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id,{headers:sessionHeaders});httpPlan=(await httpPlanResponse.json()).plan;
    const framesQueued=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/firstframes/generate",{method:"POST",headers:{...sessionHeaders,"if-match":httpPlan.etag,"idempotency-key":"canonical-firstframes-http"},body:JSON.stringify({group_ids:httpPlan.groups.map(row=>row.group_id),localization_revision:localizationRevision})});
    assert.equal(framesQueued.status,200);
    httpPlan=(await framesQueued.json()).plan;
    const stateBeforeConfirmation=await fsp.readFile(statePath),projectBeforeConfirmation=await fsp.readFile(path.join(dataRoot,"projects.json"));
    const confirmationBlocked=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/confirm",{method:"POST",headers:{...sessionHeaders,"if-match":httpPlan.etag},body:JSON.stringify({localization_revision:localizationRevision})});
    assert.equal(confirmationBlocked.status,409);
    assert.deepEqual(await fsp.readFile(statePath),stateBeforeConfirmation);
    assert.deepEqual(await fsp.readFile(path.join(dataRoot,"projects.json")),projectBeforeConfirmation);
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
    await page.waitForSelector("[data-enter-step03]", { timeout: 20000 });
    await page.click("[data-enter-step03]");
    await page.waitForURL(/stage\/03\/market\/es-MX/);
    await page.waitForFunction(
      () =>
        document.querySelector(".step03-stage")?.textContent.includes("Lucia"),
      null,
      { timeout: 20000 },
    );
    assert.equal(await page.locator("[data-step03-substep]").count(), 4);
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
    const assetPageText=await page.locator(".step03-workspace").innerText();
    assert.match(
      assetPageText,
      /需先确认 1 位重要角色/,
    );
    assert.doesNotMatch(assetPageText,/Step\s*0?[1-5]|RunningHub|provider|receipt|controller|lease|token|[a-f0-9]{64}|[A-Z]:[\\/]/i);
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-assets-desktop.png"),
    });
    await page.click('[data-step03-substep="firstframes"]');
    assert.match(
      await page.locator(".step03-workspace").innerText(),
      /首帧生产中/,
    );
    await page.screenshot({
      path: path.join(browserEvidenceRoot, "step03-firstframes-desktop.png"),
    });
    await page.click('[data-step03-substep="confirmation"]');
    assert.match(
      await page.locator(".step03-workspace").innerText(),
      /尚未确认|生产中/,
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
    await mobile.click('[data-step03-substep="assets"]');
    const mobileAssetText=await mobile.locator(".step03-workspace").innerText();
    assert.doesNotMatch(mobileAssetText,/Step\s*0?[1-5]|RunningHub|provider|receipt|controller|lease|token|[a-f0-9]{64}|[A-Z]:[\\/]/i);
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
    const evidencePage=await context.newPage();
    await evidencePage.goto(base+"/#redraw-evidence/"+expected.evidenceId+"/shot/S001",{waitUntil:"domcontentloaded"});
    await evidencePage.waitForSelector(".production-evidence-workspace",{timeout:20000});
    const evidenceDesktopText=await evidencePage.locator(".production-evidence-studio").innerText();
    assert.doesNotMatch(evidenceDesktopText,/Step\s*0?[1-5]|RunningHub|provider|receipt|controller|lease|token|[a-f0-9]{64}|[A-Z]:[\\/]/i);
    await evidencePage.setViewportSize({width:390,height:844});
    await evidencePage.reload({waitUntil:"domcontentloaded"});
    await evidencePage.waitForSelector(".production-evidence-workspace",{timeout:20000});
    const evidenceMobileText=await evidencePage.locator(".production-evidence-studio").innerText();
    assert.doesNotMatch(evidenceMobileText,/Step\s*0?[1-5]|RunningHub|provider|receipt|controller|lease|token|[a-f0-9]{64}|[A-Z]:[\\/]/i);
    await evidencePage.screenshot({path:path.join(browserEvidenceRoot,"canonical-evidence-mobile.png"),fullPage:true});
    assert.deepEqual(errors, []);
    await browser.close();browser=null;
    child.kill();await new Promise(resolve=>child.once("exit",resolve));
    child=spawn(process.execPath,["server.js"],{cwd:__dirname,env:serverEnv,stdio:["ignore","pipe","pipe"],windowsHide:true});
    child.stdout.on("data",chunk=>logs.push(String(chunk)));child.stderr.on("data",chunk=>logs.push(String(chunk)));
    await waitHealth(base,child,logs);
    const restartedPlanResponse=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id,{headers:sessionHeaders});
    assert.equal(restartedPlanResponse.status,200);const restartedPlan=(await restartedPlanResponse.json()).plan;
    const restartStateBefore=await fsp.readFile(statePath),restartProjectBefore=await fsp.readFile(path.join(dataRoot,"projects.json"));
    const restartGate=await fetch(base+"/api/projects/"+projectId+"/step03/plans/"+planned.plan_id+"/confirm",{method:"POST",headers:{...sessionHeaders,"if-match":restartedPlan.etag},body:JSON.stringify({localization_revision:localizationRevision})});
    assert.equal(restartGate.status,409);assert.deepEqual(await fsp.readFile(statePath),restartStateBefore);assert.deepEqual(await fsp.readFile(path.join(dataRoot,"projects.json")),restartProjectBefore);
    process.stdout.write(
      JSON.stringify({
        ok: true,
        level: "integrated_http_ui",
        region_gate: 3,
        market_route: true,
        step03_substeps: 4,
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
         independent_child_restart_durable_gate:true,
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
