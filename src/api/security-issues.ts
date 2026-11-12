import type { RequestOptions } from '../client.ts';
import type { SecurityIssue, SecurityIssueState } from '../schema.ts';
import type { QueryValue } from '../php.ts';
import { Resource, type Open } from './resource.ts';

export interface SecurityIssueFilters {
  'security-issue-state'?: Open<SecurityIssueState>;
  limit?: number;
  [filter: string]: QueryValue;
}

export class SecurityIssues extends Resource {
  static readonly STATE_OPEN = 'open';
  static readonly STATE_IN_PROGRESS = 'in-progress';
  static readonly STATE_NOT_AFFECTED = 'not-affected';
  static readonly STATE_INCORRECT = 'incorrect';
  static readonly STATE_NO_CAPACITY = 'no-capacity';
  static readonly STATE_IGNORE = 'ignore';
  static readonly STATE_RESOLVED = 'resolved';

  all(filters: SecurityIssueFilters = {}, options?: RequestOptions): Promise<SecurityIssue[]> {
    return this.client.getCollection('/security-issues/', filters, options);
  }

  show(issueId: number, options?: RequestOptions): Promise<SecurityIssue> {
    return this.client.get(this.client.buildPath('/security-issues/%s', issueId), undefined, options);
  }

  open(issueId: number, options?: RequestOptions): Promise<SecurityIssue> {
    return this.client.post(this.client.buildPath('/security-issues/%s/open', issueId), undefined, options);
  }

  /** Closes an issue with one of the closing states, for example "not-affected" or "resolved". */
  close(issueId: number, state: Open<SecurityIssueState>, options?: RequestOptions): Promise<SecurityIssue> {
    return this.client.post(this.client.buildPath('/security-issues/%s/close/%s', issueId, state), undefined, options);
  }
}
