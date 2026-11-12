import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { TeamPermissions, validateWebhookSignature, WebhookSignature } from '../src/index.ts';
import { fixture } from './helpers.ts';

interface Primitives {
  webhooks: Array<{ secret: string; payload: string; signature: string; valid: boolean }>;
  teamPermissions: Array<{ flags: number; permissions: Record<string, boolean> }>;
}

const primitives = fixture<Primitives>('php-primitives.json');

describe('WebhookSignature', () => {
  primitives.webhooks.forEach((vector, index) => {
    test(`#${index + 1} matches PHP hash_hmac for ${JSON.stringify(vector.payload).slice(0, 40)}`, async () => {
      const webhook = new WebhookSignature(vector.secret);
      assert.equal(await webhook.sign(vector.payload), vector.signature);
      assert.equal(await webhook.validate(vector.signature, vector.payload), vector.valid);
    });
  });

  test('rejects a wrong, truncated or missing signature', async () => {
    const [vector] = primitives.webhooks;
    const webhook = new WebhookSignature(vector!.secret);
    assert.equal(await webhook.validate(vector!.signature.replace(/.$/, '0'), vector!.payload), false);
    assert.equal(await webhook.validate(vector!.signature.slice(0, -1), vector!.payload), false);
    assert.equal(await webhook.validate(null, vector!.payload), false);
    assert.equal(await webhook.validate(vector!.signature, `${vector!.payload} `), false);
  });

  test('accepts the payload as bytes', async () => {
    const [vector] = primitives.webhooks;
    assert.equal(await validateWebhookSignature(vector!.secret, vector!.signature, new TextEncoder().encode(vector!.payload)), true);
  });
});

describe('TeamPermissions', () => {
  test('fromFlags matches PHP for every flag combination', () => {
    for (const vector of primitives.teamPermissions) {
      assert.deepEqual(TeamPermissions.fromFlags(vector.flags).toParameters(), vector.permissions, `flags ${vector.flags}`);
      assert.equal(TeamPermissions.fromFlags(vector.flags).toFlags(), vector.flags);
    }
  });

  test('fromTeamResponse reads the old canCreateSubrepositories name too', () => {
    const permissions = TeamPermissions.fromTeamResponse({ permissions: { canCreateSubrepositories: true, canAddPackages: 1 } });
    assert.equal(permissions.canCreateSuborganizations, true);
    assert.equal(permissions.canCreateSubrepositories, true);
    assert.equal(permissions.canAddPackages, true);
    assert.equal(permissions.canEditTeamPackages, false);
  });

  test('fromTeamResponse copes with a team without permissions', () => {
    assert.equal(TeamPermissions.fromTeamResponse({}).toFlags(), 0);
  });
});
