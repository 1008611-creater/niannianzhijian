'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {createNomiWebTaskStore} = require('./bridge/niannian_nomi_web_task_store');

async function run() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'niannian-nomi-credit-'));
  try {
    const store = createNomiWebTaskStore({filePath:path.join(root, 'tasks.json')});
    const grant = await store.createGrant({ownerId:'U1',projectId:'P1',projectKind:'redraw',nodeIds:['N1']});
    const claimed = await store.claimTask({ownerId:'U1',projectId:'P1',projectKind:'redraw',nodeId:'N1',grantId:grant.id,idempotencyKey:'once',tenantId:'T1',submitted:{mode:'h3',modelKey:'minimax-h3',prompt:'redacted',parameters:{}}});
    const updated = await store.updateOwnedTask('U1','P1',claimed.task.id,{tenantId:'T1',creditReservationId:'CR-1',creditAmount:20,creditState:'reserved'});
    assert.equal(updated.creditState, 'reserved');
    const rows = await store.listForCommerce({limit:10});
    assert.equal(rows[0].creditAmount, 20);
    assert.equal(rows[0].creditState, 'reserved');
    assert.equal(rows[0].model, 'minimax-h3');
    assert.equal(JSON.stringify(rows).includes('redacted'), false);
    console.log('NOMI_WEB_TASK_STORE_CREDIT_CONTRACT_OK');
  } finally { await fs.rm(root, {recursive:true,force:true}); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
