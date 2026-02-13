const { db } = require('./database/db');
const scheduler = require('./lib/scheduler/CronScheduler');

async function checkSchedulerStatus() {
  try {
    console.log('\n=== CHECKING SCHEDULER STATUS ===\n');
    
    const status = await scheduler.getStatus();
    console.log('Scheduler Running:', status.isRunning);
    console.log('Job Count:', status.jobCount);
    console.log('\nJobs:');
    console.log(JSON.stringify(status.jobs, null, 2));
    
    console.log('\n=== DATABASE VALUES ===\n');
    const config = await db('sync_configs').where({ id: 19 }).first();
    console.log('Config ID:', config.id);
    console.log('Name:', config.name);
    console.log('Schedule:', config.schedule_cron);
    console.log('next_sync_at:', config.next_sync_at);
    console.log('last_sync_at:', config.last_sync_at);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchedulerStatus();
