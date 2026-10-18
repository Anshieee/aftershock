/**
 * Smoke-test: connect to the FalkorDB cloud instance, create + read + delete a tiny graph.
 * Run with: npm run check   (loads .env from the project root)
 */
import 'dotenv/config';
import { FalkorDB } from 'falkordb';

const db = await FalkorDB.connect({
  username: process.env.FALKORDB_USER,
  password: process.env.FALKORDB_PASSWORD,
  socket: {
    host: process.env.FALKORDB_HOST,
    port: Number(process.env.FALKORDB_PORT ?? 6379),
  },
});

const graphName = 'falkor_setup_smoke_test';
const graphs = await db.list();
console.log('connected. existing graphs:', graphs);

const graph = db.selectGraph(graphName);
await graph.query('CREATE (:HealthCheck {ok: true, created_at: timestamp()})');
const res = await graph.roQuery('MATCH (n:HealthCheck) RETURN n.ok AS ok, count(n) AS nodes');
console.log('smoke query result:', JSON.stringify(res.benchmarkExecutionTime !== undefined ? { ...res, benchmarkExecutionTime: undefined } : res));
await graph.delete();
console.log('smoke graph cleaned up. setup OK.');

await db.close();
