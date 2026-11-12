import type { RequestOptions } from '../client.ts';
import type { Job } from '../schema.ts';
import { Resource } from './resource.ts';

export class Organization extends Resource {
  /** Starts a synchronization of the organization with its integrations. Returns the jobs it queued. */
  sync(options?: RequestOptions): Promise<Job[]> {
    return this.client.post('/organization/sync', undefined, options);
  }

  /** The public SSH key Private Packagist uses to clone repositories. Not in the PHP client. */
  sshAccessKey(options?: RequestOptions): Promise<{ key: string }> {
    return this.client.get('/organization/ssh-access-key', undefined, options);
  }

  /** The access report of the organization as CSV text. Not in the PHP client. */
  async accessReport(options?: RequestOptions): Promise<string> {
    const response = await this.client.request<string | undefined>(
      { method: 'GET', path: '/organization/access-report.csv', headers: { Accept: 'text/csv' } },
      options,
    );
    return typeof response.data === 'string' ? response.data : response.data === undefined ? '' : JSON.stringify(response.data);
  }
}
