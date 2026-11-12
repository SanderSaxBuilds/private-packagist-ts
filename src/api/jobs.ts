import type { PrivatePackagistClient, RequestOptions } from '../client.ts';
import { JobFailedError, JobTimeoutError } from '../errors.ts';
import type { Job } from '../schema.ts';
import { Resource } from './resource.ts';

export interface WaitForJobOptions extends RequestOptions {
  /** Give up after this many seconds. Default 180. */
  maxWaitSeconds?: number;
  /** Seconds between polls. Default 5. */
  waitInterval?: number;
}

export class Jobs extends Resource {
  show(jobId: string, options?: RequestOptions): Promise<Job> {
    return this.client.get(this.client.buildPath('/jobs/%s', jobId), undefined, options);
  }

  /**
   * Polls a job until it succeeds and returns it. Throws JobFailedError when the job ends with
   * status "error" and JobTimeoutError when it is still running after maxWaitSeconds.
   */
  async waitForJob(jobId: string, options: WaitForJobOptions = {}): Promise<Job> {
    const { maxWaitSeconds = 180, waitInterval = 5, ...requestOptions } = options;
    const deadline = Date.now() + maxWaitSeconds * 1000;
    while (deadline > Date.now()) {
      const job = await this.show(jobId, requestOptions);
      if (job.status === 'success') return job;
      if (job.status === 'error') throw new JobFailedError(job);
      await this.client.sleep(waitInterval * 1000, requestOptions.signal);
    }
    throw new JobTimeoutError(jobId, maxWaitSeconds);
  }
}

/** The PHP JobHelper, for code ported from PHP: `new JobHelper(client).waitForJob(id, 180, 5)`. */
export class JobHelper {
  readonly #client: PrivatePackagistClient;

  constructor(client: PrivatePackagistClient) {
    this.#client = client;
  }

  waitForJob(jobId: string, maxWaitSeconds = 180, waitInterval = 5, options: RequestOptions = {}): Promise<Job> {
    return this.#client.jobs.waitForJob(jobId, { ...options, maxWaitSeconds, waitInterval });
  }
}
