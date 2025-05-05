#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  },
  
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

function colorize(text, color) {
  return `${color}${text}${colors.reset}`;
}

function printHeader(text) {
  console.log('\n' + colorize('='.repeat(80), colors.fg.cyan));
  console.log(colorize(` ${text} `, colors.fg.cyan + colors.bright));
  console.log(colorize('='.repeat(80), colors.fg.cyan) + '\n');
}

function printStep(number, text) {
  console.log(colorize(`Step ${number}: ${text}`, colors.fg.yellow + colors.bright));
}

function printSuccess(text) {
  console.log(colorize(`✓ ${text}`, colors.fg.green));
}

function printError(text) {
  console.log(colorize(`✗ ${text}`, colors.fg.red));
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(colorize(`? ${question} `, colors.fg.magenta), (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  try {
    printHeader('Finance Sync Worker - Supabase Setup');
    
    console.log(colorize('This script will help you set up your Supabase project for the Finance Sync Worker.', colors.fg.white));
    console.log(colorize('Make sure you have already created a Supabase project before continuing.', colors.fg.white));
    console.log('\n');
    
    printStep(1, 'Supabase Project Configuration');
    console.log('You can find your Supabase URL and service role key in your project settings.');
    console.log('Go to: Project Settings > API > Project URL and Project API keys\n');
    
    const supabaseUrl = await askQuestion('Enter your Supabase URL (e.g., https://abcdefghijklm.supabase.co):');
    const supabaseKey = await askQuestion('Enter your Supabase service role key:');
    
    if (!supabaseUrl || !supabaseKey) {
      printError('Supabase URL and service role key are required.');
      process.exit(1);
    }
    
    printStep(2, 'Setting up environment variables');
    
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      printSuccess('Found existing .env file');
    } else {
      envContent = fs.readFileSync(path.join(__dirname, '.env.example'), 'utf8');
      printSuccess('Created .env file from example');
    }
    
    envContent = envContent.replace(/SUPABASE_URL=.*/, `SUPABASE_URL=${supabaseUrl}`);
    envContent = envContent.replace(/SUPABASE_SERVICE_ROLE=.*/, `SUPABASE_SERVICE_ROLE=${supabaseKey}`);
    
    fs.writeFileSync(envPath, envContent);
    printSuccess('Updated Supabase credentials in .env file');
    
    printStep(3, 'Installing required npm packages');
    
    try {
      execSync('npm install @supabase/supabase-js dotenv', { stdio: 'inherit' });
      printSuccess('Installed required npm packages');
    } catch (error) {
      printError('Failed to install npm packages. Please run "npm install @supabase/supabase-js dotenv" manually.');
    }
    
    printStep(4, 'Creating database schema setup script');
    
    const setupSchemaPath = path.join(__dirname, 'setup-schema.js');
    const setupSchemaContent = `
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function setupSchema() {
  try {
    console.log('Setting up database schema...');
    
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, 'src', 'schema.sql'),
      'utf8'
    );
    
    const { error: schemaError } = await supabase.rpc('exec_sql', {
      sql_string: schemaSQL
    });
    
    if (schemaError) {
      console.error('Error setting up schema:', schemaError);
      return;
    }
    
    console.log('Schema setup complete!');
    
    const anomaliesSQL = fs.readFileSync(
      path.join(__dirname, 'src', 'anomalies.sql'),
      'utf8'
    );
    
    const { error: anomaliesError } = await supabase.rpc('exec_sql', {
      sql_string: anomaliesSQL
    });
    
    if (anomaliesError) {
      console.error('Error setting up anomalies functions:', anomaliesError);
      return;
    }
    
    console.log('Anomalies functions setup complete!');
    console.log('Database setup completed successfully!');
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupSchema();
`;
    
    fs.writeFileSync(setupSchemaPath, setupSchemaContent);
    printSuccess('Created setup-schema.js script');
    
    printStep(5, 'Creating SQL execution function in Supabase');
    
    console.log('Before running the schema setup script, you need to create a SQL function in Supabase.');
    console.log('Go to your Supabase dashboard > SQL Editor and run the following SQL:');
    console.log('\n');
    console.log(colorize(`
CREATE OR REPLACE FUNCTION exec_sql(sql_string TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql_string;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`, colors.fg.blue));
    
    console.log('\n');
    const sqlExecuted = await askQuestion('Have you executed the SQL function above? (y/n):');
    
    if (sqlExecuted.toLowerCase() !== 'y') {
      printError('Please execute the SQL function before continuing.');
      console.log('You can run this setup script again after creating the function.');
      process.exit(1);
    }
    
    printStep(6, 'Running database schema setup');
    
    console.log('Now we will run the setup-schema.js script to create the database schema and functions.');
    const runSetup = await askQuestion('Do you want to run the setup script now? (y/n):');
    
    if (runSetup.toLowerCase() === 'y') {
      try {
        execSync('node setup-schema.js', { stdio: 'inherit' });
        printSuccess('Database schema setup completed successfully!');
      } catch (error) {
        printError('Failed to run setup script. Please run "node setup-schema.js" manually.');
      }
    } else {
      console.log('You can run the setup script later with: node setup-schema.js');
    }
    
    printHeader('Setup Complete!');
    
    console.log(colorize('Your Supabase project is now configured for the Finance Sync Worker.', colors.fg.green));
    console.log('\n');
    console.log('Next steps:');
    console.log('1. Complete the rest of your .env file with QuickBooks, Plaid, and Slack credentials');
    console.log('2. Deploy your worker with: npm run deploy');
    console.log('3. Set up your Slack bot using the instructions in src/slack-setup.html');
    console.log('\n');
    console.log(colorize('Thank you for using Finance Sync Worker!', colors.fg.cyan + colors.bright));
    
  } catch (error) {
    printError(`An error occurred: ${error.message}`);
  } finally {
    rl.close();
  }
}

main();
