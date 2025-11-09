import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './pool';

async function migrate() {
  try {
    console.log('Running database migrations...');

    const schemaSQL = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await db.query(schemaSQL);

    console.log('Database migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
