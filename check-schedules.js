const { db } = require('./database/db');
const scheduler = require('./lib/scheduler/CronScheduler');

async function checkSchedules() {
  try {
    console.log('\n=== DATABASE SCHEDULES ===');
    const configs = await db('sync_configs')
      .select('id', 'name', 'schedule_cron', 'last_sync_at', 'next_sync_at');
    
    configs.forEach(c => {
      console.log(`\nID: ${c.id}`);
      console.log(`  Name: ${c.name}`);
      console.log(`  Schedule: ${c.schedule_cron || 'Not scheduled'}`);
      console.log(`  Last Sync: ${c.last_sync_at || 'Never'}`);
      console.log(`  Next Sync: ${c.next_sync_at || 'Not set'}`);
    });

    console.log('\n\n=== SCHEDULER STATUS ===');
    const status = await scheduler.getStatus();
    console.log(`Running: ${status.isRunning}`);
    console.log(`Job Count: ${status.jobCount}`);
    console.log(`Status: ${status.status}`);
    
    if (status.jobs && status.jobs.length > 0) {
      console.log('\nScheduled Jobs:');
      status.jobs.forEach(job => {
        console.log(`\n  Config ID: ${job.configId}`);
        console.log(`  Name: ${job.configName}`);
        console.log(`  Cron: ${job.cronExpression}`);
        console.log(`  Next Run: ${job.nextRun || 'Not set'}`);
        console.log(`  Last Run: ${job.lastRun || 'Never'}`);
      });
    } else {
      console.log('\nNo jobs in scheduler');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchedules();
