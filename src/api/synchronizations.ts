import type { RequestOptions } from '../client.ts';
import type { Synchronization } from '../schema.ts';
import { Resource } from './resource.ts';

export class Synchronizations extends Resource {
  /** The organization's synchronizations with GitHub, GitLab, Bitbucket and other integrations. */
  all(options?: RequestOptions): Promise<Synchronization[]> {
    return this.client.getCollection('/synchronizations/', undefined, options);
  }
}
