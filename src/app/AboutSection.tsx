import { useState } from 'react';
import { version } from '../../package.json';
import assetNotice from './asset-notice.txt?raw';

/** The packaged game carries the open-source license texts in its payload (tools/distribution/third-party-notices.mjs). */
const NOTICES_URL = '/THIRD-PARTY-NOTICES.txt';

async function loadNotices() {
  const response = await fetch(NOTICES_URL);
  // A development server answers a missing file with the page itself.
  if (!response.ok || !response.headers.get('content-type')?.startsWith('text/plain')) return null;
  return response.text();
}

/** 关于: the version, the asset notice and the third-party licenses. */
export function AboutSection() {
  const [notices, setNotices] = useState<string | null | undefined>(undefined);
  return <>
    <h3>关于</h3>
    <p>赛尔经典 · Seer Classic，版本 {version}</p>
    <p className="about-notice">{assetNotice.trim()}</p>
    <p>本作使用 React、PixiJS、Ruffle、Tauri 等开源软件，其许可条款随游戏附在 THIRD-PARTY-NOTICES.txt 中。</p>
    {notices === undefined && <button onClick={() => void loadNotices().then(setNotices, () => setNotices(null))}>查看开源许可</button>}
    {notices === null && <p className="small muted">开源许可文本随安装包提供。</p>}
    {notices && <pre className="about-licenses" tabIndex={0}>{notices}</pre>}
  </>;
}
