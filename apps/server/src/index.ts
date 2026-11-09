// Save_API entry point. Routes are implemented in task 19 (see .kiro/specs/human-resource-mvp/tasks.md).
import { buildApp } from './app';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const app = await buildApp({ dataDir: process.env.DATA_DIR ?? './data', webDir: process.env.WEB_DIR ?? null });
await app.listen({ port, host });
