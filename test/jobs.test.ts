import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { AbortError, JobFailedError, JobHelper, JobTimeoutError, PrivatePackagistClient } from '../src/index.ts';
import { json, mockFetch } from './helpers.ts';

const id = '46bf13150a86fece079ca979cb8ef57c78773faa';

describe('waiting for jobs', () => {
  test('returns the job once it succeeds, waiting the interval between polls', async () => {
    const waits: number[] = [];
    const mock = mockFetch([json({ id, status: 'queued' }), json({ id, status: 'running' }), json({ id, status: 'success' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch, sleep: async (ms) => void waits.push(ms) });
    const job = await client.jobs.waitForJob(id, { waitInterval: 2 });
    assert.equal(job.status, 'success');
    assert.deepEqual(waits, [2000, 2000]);
  });

  test('throws JobFailedError with the job when it ends in error', async () => {
    const mock = mockFetch([json({ id, status: 'error', message: 'Could not clone the repository' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    await assert.rejects(client.jobs.waitForJob(id), (error: unknown) => {
      assert.ok(error instanceof JobFailedError);
      assert.equal(error.message, 'Could not clone the repository');
      assert.equal(error.job.id, id);
      return true;
    });
  });

  test('throws JobTimeoutError when the time is up', async () => {
    const mock = mockFetch([], () => json({ id, status: 'running' }));
    const client = new PrivatePackagistClient({ fetch: mock.fetch, sleep: () => new Promise((resolve) => setTimeout(resolve, 15)) });
    await assert.rejects(client.jobs.waitForJob(id, { maxWaitSeconds: 0.03, waitInterval: 0 }), (error: unknown) => {
      assert.ok(error instanceof JobTimeoutError);
      assert.equal(error.jobId, id);
      return true;
    });
    assert.ok(mock.requests.length >= 1);
  });

  test('stops waiting when the signal aborts', async () => {
    const mock = mockFetch([], () => json({ id, status: 'queued' }));
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    await assert.rejects(client.jobs.waitForJob(id, { waitInterval: 60, signal: controller.signal }), AbortError);
  });

  test('JobHelper keeps the PHP signature', async () => {
    const mock = mockFetch([json({ id, status: 'success' })]);
    const client = new PrivatePackagistClient({ fetch: mock.fetch });
    assert.equal((await new JobHelper(client).waitForJob(id, 10, 0)).status, 'success');
  });
});
