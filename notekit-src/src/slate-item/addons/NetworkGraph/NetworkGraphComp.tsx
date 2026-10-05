import React from 'react';
// import G6 from '@antv/g6';
import { EleBody, EleSubitems } from '../../components/Ele';
import { mkid } from '../../utils/string/mkid';
import { cls } from '../../styles';
import { useAddons } from '../../hooks/useAddons';
import type { NetEdge, NetNode } from './GraphDataIndex';
import { PartOuter } from '../../components/UnitView/Parts';
import { loadScript } from '../../utils/dom/loadScript';

function refreshDragedNodePosition(e: any) {
  const model = e.item.get('model');
  model.fx = e.x;
  model.fy = e.y;
}

const commonCfg = {
  modes: {
    default: [
      'click-select',
      'drag-canvas',
      'drag-node',
      'zoom-canvas',
      // 大图禁用 activate-relations（悬停高亮相邻）：每次 hover 触发全图重绘，非常卡
    ],
  },
  defaultEdge: {
    style: {
      stroke: '#dddddd',
    },
  },
  defaultNode: {
    style: {
      fill: '#aaaaaa',
      stroke: '#aaaaaa',
      cursor: 'pointer',
    },
    labelCfg: {
      position: 'bottom',
      offset: 5,
      style: {
        fontSize: 14,
        fill: '#777777',
      },
    },
  },
  nodeStateStyles: {
    default: {
      fill: '#999999',
      stroke: '#999999',
    },

    // 鼠标 hover 上节点，即 hover 状态为 true 时的样式
    hover: {
      fill: '#03a9f4',
      stroke: '#03a9f4',
      shadowBlur: 0,
    },
    active: {
      fill: '#03a9f4',
      stroke: '#03a9f4',
      opacity: 0.3,
      shadowBlur: 0,
    },

    inactive: {
      opacity: 0.1,
      stroke: '#666666',
    },
    // 鼠标点击节点，即 highlight 状态为 true 时的样式
    highlight: {
      fill: '#03a9f4',
      stroke: '#03a9f4',
      labelCfg: {
        style: {
          fill: '#03a9f4',
        },
      },
    },
    weaken: {
      opacity: 0.3,
    },
  },
  edgeStateStyles: {
    // 鼠标点击边，即 highlight 状态为 true 时的样式
    highlight: {
      stroke: '#03a9f4',
      lineWidth: 1,
    },
    active: {
      stroke: '#03a9f4',
      lineWidth: 1,
    },
    inactive: {
      opacity: 0.5,
    },
    default: {
      stroke: '#666666',
    },
    // lineAppendWidth: 10, // 边响应鼠标事件时的检测宽度，当 lineWidth 太小而不易选中时，可以通过该参数提升击中范围
  },
  // 大图性能优化：
  // - animate 关闭，避免交互时每帧全量重绘
  // - enableOptimize 在拖拽/缩放过程中隐藏标签等次要图形，松手才完整重绘
  animate: false,
  enableOptimize: true,
};

const boxStyle = cls`flex-basis: 100%; height: 100%;`;

function seedPosition(id: string, scale: number) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  const radius = scale * (0.2 + ((Math.imul(hash, 1664525) >>> 0) / 4294967296) * 0.8);
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function readTheme(container: HTMLElement) {
  const style = getComputedStyle(container);
  const color = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    node: color('--nk-muted', '#888888'), edge: color('--nk-line-strong', '#dddddd'),
    accent: color('--nk-accent', '#0a84ff'), text: color('--nk-ink', '#333333'),
  };
}

function applyLeafVisibility(graph: any, showLeaves: boolean) {
  if (!graph || graph.get('destroyed')) return;
  const visible = new Set<string>();
  graph.setAutoPaint(false);
  for (const item of graph.getNodes()) {
    const model = item.get('model');
    const show = showLeaves || (model._degree || 0) >= 2;
    if (show) { visible.add(model.id); graph.showItem(item); }
    else graph.hideItem(item);
  }
  for (const item of graph.getEdges()) {
    const model = item.get('model');
    if (visible.has(model.source) && visible.has(model.target)) graph.showItem(item);
    else graph.hideItem(item);
  }
  graph.setAutoPaint(true);
  graph.paint();
}

function applyTheme(graph: any, container: HTMLElement) {
  if (!graph || graph.get('destroyed')) return;
  const theme = readTheme(container);
  graph.set('nodeStateStyles', {
    ...commonCfg.nodeStateStyles,
    default: { fill: theme.node, stroke: theme.node },
    hover: { fill: theme.accent, stroke: theme.accent, shadowBlur: 0 },
    active: { fill: theme.accent, stroke: theme.accent, opacity: 0.3, shadowBlur: 0 },
    highlight: { fill: theme.accent, stroke: theme.accent, labelCfg: { style: { fill: theme.accent } } },
  });
  graph.set('edgeStateStyles', {
    ...commonCfg.edgeStateStyles,
    highlight: { stroke: theme.accent, lineWidth: 1 },
    active: { stroke: theme.accent, lineWidth: 1 },
    default: { stroke: theme.edge },
  });
  graph.setAutoPaint(false);
  for (const item of graph.getNodes()) graph.updateItem(item, {
    style: { fill: theme.node, stroke: theme.node },
    labelCfg: { style: { fill: theme.text } },
  });
  for (const item of graph.getEdges()) graph.updateItem(item, { style: { stroke: theme.edge } });
  graph.setAutoPaint(true);
  graph.paint();
}

export function NetworkGraphComp(props: {
  nodes: NetNode[];
  edges: NetEdge[];
}) {
  const [id] = React.useState(mkid());
  const ref = React.useRef<HTMLDivElement>(null);
  // const loadingRef = React.useRef<HTMLDivElement>(null);
  const { topic } = useAddons();
  const { nodes, edges } = props;

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  // 默认隐藏"叶子节点"（只被一条边引用的节点，通常是日记、临时笔记等低价值节点），
  // 这是笔记类图谱的通用最佳实践（参考 Obsidian 局部图谱）：显著降低节点数，布局更快、图更可读
  const [showLeaves, setShowLeaves] = React.useState(false);

  const displayData = React.useMemo(() => {
    const degree: Record<string, number> = {};
    for (const e of edges) {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    }
    const scale = Math.sqrt(nodes.length) * 10;
    return {
      nodes: nodes.map((node) => ({
        ...node, ...seedPosition(node.id, scale), _baseSize: node.size || 6,
        _label: node.label, _degree: degree[node.id] || 0,
      })),
      edges,
    };
  }, [nodes, edges]);

  const graphRef = React.useRef<any>(null);
  const resizeRef = React.useRef<ResizeObserver>();
  const themeRef = React.useRef<MutationObserver>();
  const showLeavesRef = React.useRef(showLeaves);
  showLeavesRef.current = showLeaves;
  const dataRef = React.useRef(displayData);
  dataRef.current = displayData;

  // 数据集变化时更新图数据并重跑布局（worker 布局不阻塞 UI）
  React.useEffect(() => {
    const graph = graphRef.current;
    if (!graph || graph.get('destroyed')) return;
    graph.changeData(dataRef.current);
    applyLeafVisibility(graph, showLeavesRef.current);
    setLoading(true);
  }, [displayData]);

  React.useEffect(() => {
    applyLeafVisibility(graphRef.current, showLeaves);
  }, [showLeaves]);

  React.useLayoutEffect(() => {
    let disposed = false;
    let layoutFrame = 0;
    loadScript('js/g6-4.7.4.js')
      .then(() => {
        if (disposed) return;
        const container = ref.current as HTMLDivElement;
        const width = container.scrollWidth;
        const height = container.scrollHeight || 500;
        const theme = readTheme(container);
        const { G6 } = window as any;
        const layout = {
          type: 'fruchterman', gravity: 5, speed: 10, maxIteration: 300,
          workerEnabled: typeof Worker !== 'undefined',
          workerScriptURL: new URL('/static/assets/js/layout.min.js', document.baseURI).href,
          gpuEnabled: false,
        };
        const graph = new G6.Graph({
          container, width, height, ...commonCfg,
          defaultEdge: { style: { stroke: theme.edge } },
          defaultNode: {
            style: { fill: theme.node, stroke: theme.node, cursor: 'pointer' },
            labelCfg: { position: 'bottom', offset: 5, style: { fontSize: 14, fill: theme.text } },
          },
          nodeStateStyles: {
            ...commonCfg.nodeStateStyles,
            default: { fill: theme.node, stroke: theme.node },
            hover: { fill: theme.accent, stroke: theme.accent, shadowBlur: 0 },
            active: { fill: theme.accent, stroke: theme.accent, opacity: 0.3, shadowBlur: 0 },
            highlight: { fill: theme.accent, stroke: theme.accent, labelCfg: { style: { fill: theme.accent } } },
          },
          edgeStateStyles: {
            ...commonCfg.edgeStateStyles,
            highlight: { stroke: theme.accent, lineWidth: 1 },
            active: { stroke: theme.accent, lineWidth: 1 },
            default: { stroke: theme.edge },
          },
        });
        graphRef.current = graph;

        graph.on('afterlayout', () => {
          graph.fitView(20);
          applyLeafVisibility(graph, showLeavesRef.current);
          setLoading(false);
        });
        graph.on('node:dragstart', (e: any) => refreshDragedNodePosition(e));
        graph.on('node:drag', (e: any) => refreshDragedNodePosition(e));
        graph.on('node:dragend', (e: any) => {
          e.item!.get('model').fx = null;
          e.item!.get('model').fy = null;
        });
        graph.on('click', (e: any) => {
          if (!e.item || e.item.getType() !== 'node') return;
          topic.route(e.item.get('model').id);
        });

        // Paint deterministic coordinates before starting the expensive layout.
        graph.data(displayData);
        graph.render();
        applyLeafVisibility(graph, showLeavesRef.current);
        layoutFrame = requestAnimationFrame(() => {
          if (!disposed && !graph.get('destroyed')) graph.updateLayout(layout);
        });

        const observer = new ResizeObserver(() => {
          if (!graph.get('destroyed') && container.clientWidth && container.clientHeight) {
            graph.changeSize(container.clientWidth, container.clientHeight);
          }
        });
        observer.observe(container);
        resizeRef.current = observer;
        let themeSignature = JSON.stringify(theme);
        const themeObserver = new MutationObserver(() => {
          const nextSignature = JSON.stringify(readTheme(container));
          if (nextSignature === themeSignature) return;
          themeSignature = nextSignature;
          applyTheme(graph, container);
        });
        themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
        themeRef.current = themeObserver;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    })
      .catch(() => {
        if (!disposed) {
          setLoading(false);
          setError(true);
        }
      });
    return () => {
      disposed = true;
      if (layoutFrame) cancelAnimationFrame(layoutFrame);
      if (graphRef.current && !graphRef.current.get('destroyed')) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
      resizeRef.current?.disconnect();
      themeRef.current?.disconnect();
    };
  }, []);

  return (
    <PartOuter classOuter={boxStyle}>
      <EleBody classBody={boxStyle}>
        <EleSubitems classChild={boxStyle}>
          <div
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 20,
              background: 'var(--nk-surface)',
              border: '1px solid var(--nk-line-strong)',
              borderRadius: 8,
              padding: '8px 14px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.12)',
              fontSize: 13,
              userSelect: 'none',
            }}
          >
            <label style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showLeaves}
                onChange={(e) => setShowLeaves(e.target.checked)}
              />
              {' '}显示叶子节点
            </label>
          </div>
          {error && (
            <div
              style={{
                position: 'absolute', top: '45%', left: 20, right: 20,
                zIndex: 2, textAlign: 'center', color: 'var(--nk-muted)',
              }}
            >
              图谱库加载失败，请刷新重试
            </div>
          )}
          {loading && !error && (
            <div
              style={{
                position: 'absolute', top: 12, left: 12, zIndex: 2,
                color: 'var(--nk-muted)', pointerEvents: 'none', fontSize: 12,
              }}
            >
              正在整理布局…
            </div>
          )}
          <div id={id} ref={ref} className={boxStyle} />
        </EleSubitems>
      </EleBody>
    </PartOuter>
  );
}
