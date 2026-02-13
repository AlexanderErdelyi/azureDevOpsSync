const cron = require('node-cron');

const expression = '****';
console.log(`Testing cron expression: "${expression}"`);
console.log(`Valid:`, cron.validate(expression));

// Test some common valid expressions
const validExpressions = [
  '* * * * *',  // Every minute
  '0 * * * *',  // Every hour
  '0 0 * * *',  // Daily at midnight
  '*/5 * * * *', // Every 5 minutes
];

console.log('\nValid expressions:');
validExpressions.forEach(exp => {
  console.log(`  "${exp}": ${cron.validate(exp)}`);
});
