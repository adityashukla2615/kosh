import serverless from 'serverless-http';
import { createApp } from './app.js';

// Same Express app, wrapped for Lambda (Function URL / API Gateway payload v2).
export const handler = serverless(createApp());
