/** Exercise the production decoder with raw, transport-decoded, and live responses. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {stripTypeScriptTypes} from 'node:module';
const code=stripTypeScriptTypes(readFileSync('src/presentation/battle-animation-response.ts','utf8'));
const {decodeBattleAnimationResponse}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const raw=readFileSync('public/battle-animations/1.json.gz');
for(const response of [new Response(raw),new Response(gunzipSync(raw),{headers:{'Content-Encoding':'gzip'}}),new Response(gunzipSync(raw))])assert.equal((await decodeBattleAnimationResponse(response)).petId,1);
for(const url of process.argv.slice(2)){const response=await fetch(url);const encoding=response.headers.get('content-encoding');const clip=await decodeBattleAnimationResponse(response);assert.equal(clip.petId,1);console.log(`Live timeline decoded: ${url}, Content-Encoding=${encoding}, species=${clip.petId}.`);}
console.log('Production decoder passed raw-gzip, already-decoded gzip, and unencoded JSON responses.');
