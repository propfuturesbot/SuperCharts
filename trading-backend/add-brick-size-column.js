const { Pool } = require('pg');

const pool = new Pool({
  user: 'techuser',
  host: 'localhost',
  database: 'techanalysis',
  password: 'techanalysis2024',
  port: 5432,
});

async function addBrickSizeColumn() {
  try {
    console.log('Adding brick_size column to strategies table...');

    await pool.query(`
      ALTER TABLE strategies
      ADD COLUMN IF NOT EXISTS brick_size NUMERIC DEFAULT 0.25
    `);

    console.log('✅ Successfully added brick_size column');

    // Add comment
    await pool.query(`
      COMMENT ON COLUMN strategies.brick_size IS 'Brick size for Renko charts'
    `);

    console.log('✅ Added column comment');

    // Verify the column was added
    const result = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'strategies'
      AND column_name = 'brick_size'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified: brick_size column exists', result.rows[0]);
    } else {
      console.log('⚠️ Warning: brick_size column not found after adding');
    }

  } catch (error) {
    console.error('❌ Error adding brick_size column:', error);
  } finally {
    await pool.end();
  }
}

addBrickSizeColumn();