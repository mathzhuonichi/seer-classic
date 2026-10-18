import type {BossEvidenceStatus,BossEvidenceView} from '../../../kernel/contract.ts';
import './boss-evidence.css';

const statusLabels:Record<BossEvidenceStatus,string>={official:'官方资料',observed:'资料记载',inferred:'推定',authored:'重制实现'};

export function BossEvidenceContent({evidence}:{evidence:BossEvidenceView}) {
  return <div className="boss-evidence-content">
    <p>“推定”表示缺少足够可靠的依据，当前采用重制配置；“资料记载”不等于取得了官方服务器参数。</p>
    <table><thead><tr><th scope="col">项目</th><th scope="col">当前配置</th><th scope="col">依据</th></tr></thead><tbody>{evidence.fields.map(field=><tr key={field.key}><th scope="row">{field.label}</th><td>{field.value}</td><td><span className={`boss-evidence-status status-${field.status}`}>{statusLabels[field.status]}</span></td></tr>)}</tbody></table>
    <p>Boss 沿用旧版选招策略，不使用模拟玩家对战的增强 AI；旧版策略也未被认证为官方服务器算法。</p>
    {!!evidence.sourceUrls?.length&&<p>参考资料：{evidence.sourceUrls.map((url,index)=><a key={url} href={url} target="_blank" rel="noreferrer">{index?' · ':''}资料 {index+1}</a>)}</p>}
    {evidence.limitations.map((text,index)=><p className={evidence.incompleteRules?'boss-evidence-limitation':''} key={index}>{text}</p>)}
  </div>;
}

export default function BossEvidence({evidence}:{evidence?:BossEvidenceView}) {
  if(!evidence)return null;
  return <details className="boss-evidence"><summary>{evidence.incompleteRules?'部分机制未完整还原':evidence.hasInferredStats?'含推定参数':'资料依据'}<span>查看资料说明</span></summary><BossEvidenceContent evidence={evidence}/></details>;
}
