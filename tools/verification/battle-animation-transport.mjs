/** Exercise the production timeline decoder with raw, transport-decoded, and live responses. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root, suite, withSsr} from './_harness.mjs';

await withSsr('battle-animation-transport', async load => {
  const {decodeBattleAnimationResponse} = await load('/src/features/battle/battle-animation-loader.ts');
  const t = suite('battle-animation-transport');
  const raw = fs.readFileSync(path.join(root, 'public/battle-animations/1.json.gz'));
  await t.checkAsync('Raw gzip, already-decoded gzip and unencoded JSON responses each decode exactly once', async () => {
    for (const response of [new Response(raw), new Response(gunzipSync(raw), {headers: {'Content-Encoding': 'gzip'}}), new Response(gunzipSync(raw))])
      assert.equal((await decodeBattleAnimationResponse(response)).petId, 1);
  });
  await t.checkAsync('An HTTP failure is rejected before decoding', async () => {
    await assert.rejects(decodeBattleAnimationResponse(new Response(raw, {status: 404})), /Unavailable timeline/);
  });
  for (const url of process.argv.slice(2)) await t.checkAsync(`Live timeline decodes: ${url}`, async () => {
    const response = await fetch(url), encoding = response.headers.get('content-encoding');
    assert.equal((await decodeBattleAnimationResponse(response)).petId, 1);
    t.witness(url, {contentEncoding: encoding});
  });
  t.finish();
});
