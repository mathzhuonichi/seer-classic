import type {SwfClipJson} from '@seer-pet-anim/swf-bundle';
/** Fetch already decodes Content-Encoding; static portable servers may send raw gzip.
 * Inspect the actual response bytes so either transport decodes exactly once.
 */
export async function decodeBattleAnimationResponse(response:Response):Promise<SwfClipJson>{
  if(!response.ok)throw Error('Unavailable timeline');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const compressed=bytes[0]===0x1f&&bytes[1]===0x8b;
  return compressed
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as SwfClipJson
    : JSON.parse(new TextDecoder().decode(bytes)) as SwfClipJson;
}
