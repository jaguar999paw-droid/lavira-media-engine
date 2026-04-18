require('dotenv').config({ quiet: true });
const path = require('path');
const ROOT = path.join(__dirname, '..');
module.exports = {
  PORT:            process.env.PORT || 4000,
  ANTHROPIC_KEY:   process.env.ANTHROPIC_API_KEY || '',
  GIPHY_KEY:       process.env.GIPHY_API_KEY || '',
  UPLOADS_DIR:     path.join(ROOT, process.env.UPLOADS_DIR  || 'uploads'),
  POSTS_DIR:       path.join(ROOT, 'posts'),
  OUTPUTS_DIR:     path.join(ROOT, process.env.OUTPUTS_DIR  || 'outputs'),
  ASSETS_DIR:      path.join(ROOT, process.env.ASSETS_DIR   || 'assets'),
  DB_PATH:         path.isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : path.join(ROOT, process.env.DB_PATH || 'lavira.db'),
  PEXELS_KEY:      process.env.PEXELS_API_KEY || '',
};
