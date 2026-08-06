const {createRunningHubAdapter} = require('../bridge/niannian_runninghub_image_adapter');

async function run() {
  const adapter = createRunningHubAdapter();
  const taskId = 'NIANNIAN-PROBE-' + Date.now().toString(36);
  try {
    const result = await adapter.query(taskId);
    process.stdout.write(JSON.stringify({
      ok:true,
      provider:'runninghub',
      query_endpoint:true,
      authenticated:true,
      paid_task_created:false,
      result_class:result.status,
      secret_exposed:false
    }) + '\n');
  } catch (error) {
    const code = String(error?.code || 'RUNNINGHUB_PROBE_FAILED');
    if (/TASK_FAILED|NOT_FOUND|HTTP_404/.test(code)) {
      process.stdout.write(JSON.stringify({ok:true,provider:'runninghub',query_endpoint:true,authenticated:true,paid_task_created:false,result_class:'probe_task_not_found',secret_exposed:false}) + '\n');
      return;
    }
    throw error;
  }
}

run().catch(error => {
  process.stderr.write(JSON.stringify({ok:false,code:String(error?.code || 'RUNNINGHUB_PROBE_FAILED').slice(0,120),paid_task_created:false,secret_exposed:false}) + '\n');
  process.exitCode = 1;
});
