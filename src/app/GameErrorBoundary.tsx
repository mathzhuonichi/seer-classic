import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; onExport: () => void }

/** A render error would otherwise leave an empty window: offer to export the journey, which is still in memory, and to reload. */
export class GameErrorBoundary extends Component<Props, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.error === null) return this.props.children;
    return <div className="boot-screen game-error" role="alert"><h1>赛尔号 · 经典</h1>
      <p>游戏界面出错：{this.state.error}</p><p>旅程仍在内存中，可先导出存档，再重新载入。</p>
      <div className="action-row"><button className="primary" onClick={this.props.onExport}>导出存档</button>
        <button onClick={() => location.reload()}>重新载入</button></div>
    </div>;
  }
}
