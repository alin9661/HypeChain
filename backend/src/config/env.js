import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from explicit path
// This file is imported first to ensure env vars are available to all modules
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
