import React, { useEffect, useRef } from 'react'; // React import 확인
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';
import { useGlobalStore } from '../../stores/useGlobalStore';

const NetworkGraph = () => {
  const { graphData, clusters, setSelectedNode, setSelectedLink, selectedNode } = useGlobalStore();
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (graphRef.current) {
      // 물리 엔진 설정
      graphRef.current.d3Force('charge').strength(-120); 
      graphRef.current.d3Force('center', d3.forceCenter().strength(0.05));
      graphRef.current.d3Force('collide', d3.forceCollide(30)); 
      graphRef.current.d3Force('link').distance(60);
    }
  }, []);

  return (
    <div className="w-full h-screen bg-slate-50 overflow-hidden">
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#f8fafc"
        
        // ... (기존 nodeCanvasObject 등 렌더링 코드들 모두 그대로 유지) ...
        nodeCanvasObject={(node: any, ctx, globalScale) => {
            // ... (기존 코드) ...
            const isSelected = selectedNode?.id === node.id;
            const isStart = node.isStart;
            const isDbMatched = node.isTerminal === true; 
            // ... (기존 렌더링 로직 복붙 유지) ...
            const isRisk = node.group === 'risk';
            const isExchange = node.group === 'exchange';
            const baseR = isStart ? 12 : (isDbMatched ? 10 : 6);
            const r = baseR;

             if (isStart) {
                const time = Date.now();
                const pulse = (time % 2000) / 2000;
                const maxRadius = r * 4;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + (pulse * maxRadius), 0, 2 * Math.PI);
                ctx.strokeStyle = `rgba(6, 182, 212, ${1 - pulse})`;
                ctx.lineWidth = 2 / globalScale;
                ctx.stroke();
             }

             if (isDbMatched || isSelected) {
                const pulse = Math.abs(Math.sin(Date.now() / 200)) * 10 + 15;
                const glowColor = isStart ? '#06b6d4' : (node.group === 'exchange' ? '#3b82f6' : '#ef4444');
                ctx.shadowColor = glowColor;
                ctx.shadowBlur = pulse; 
             } else {
                ctx.shadowBlur = 0;
             }
             
             if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, r * 2.5, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
                ctx.fill();
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();
             }

             ctx.beginPath();
             ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
             ctx.fillStyle = node.customColor || (
                isStart ? '#06b6d4' : 
                node.group === 'exchange' ? '#3b82f6' :
                isDbMatched ? '#ef4444' : 
                node.group === 'cluster' ? '#8b5cf6' : '#22c55e'
             );
             ctx.fill();
             
             ctx.shadowBlur = 0; 
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = (isStart || isDbMatched ? 3 : 1.5) / globalScale;
             ctx.stroke();

             if (isStart) {
                ctx.fillStyle = '#ffffff';
                const fontSize = r * 0.8; 
                ctx.font = `bold ${fontSize}px Sans-Serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('S', node.x, node.y + (1/globalScale));
             } else if (isDbMatched) {
                ctx.fillStyle = '#ffffff';
                const fontSize = r * 1.2; 
                ctx.font = `900 ${fontSize}px Sans-Serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('!', node.x, node.y + (1/globalScale)); 
             }

             const fontSize = 10 / globalScale;
             ctx.font = `${fontSize}px Sans-Serif`;
             ctx.textAlign = 'center';
             ctx.textBaseline = 'middle';
             
             const label = node.memo || (node.label || node.id.slice(0, 4));
             if (isStart) ctx.font = `bold ${fontSize * 1.2}px Sans-Serif`;

             if (node.memo) {
                let memoText = node.memo.length > 8 ? node.memo.slice(0,8)+'...' : node.memo;
                const textY = node.y - r - (fontSize * 1.5);
                ctx.fillStyle = '#fef08a';
                const w = ctx.measureText(memoText).width;
                ctx.fillRect(node.x - w/2 - 2, textY - fontSize/2 - 2, w + 4, fontSize + 4);
                ctx.fillStyle = '#854d0e';
                ctx.fillText(memoText, node.x, textY);
             } else {
                ctx.fillStyle = (isStart || isDbMatched) ? '#1e293b' : '#475569';
                if(isDbMatched) ctx.font = `bold ${fontSize}px Sans-Serif`;
                ctx.fillText(label, node.x, node.y + r + fontSize + 3);
             }
        }}

        onRenderFramePre={(ctx, globalScale) => {
             clusters.forEach(cluster => {
                const nodesInCluster = graphData.nodes.filter(n => cluster.nodeIds.includes(n.id));
                if (nodesInCluster.length === 0) return;
                
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                nodesInCluster.forEach((n: any) => {
                  if (typeof n.x !== 'number') return;
                  minX = Math.min(minX, n.x);
                  maxX = Math.max(maxX, n.x);
                  minY = Math.min(minY, n.y);
                  maxY = Math.max(maxY, n.y);
                });

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;
                const radius = Math.max(maxX - minX, maxY - minY) / 2 + 20;

                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fillStyle = cluster.color + '20';
                ctx.fill();
                ctx.strokeStyle = cluster.color;
                ctx.lineWidth = 1 / globalScale;
                ctx.setLineDash([5 / globalScale, 3 / globalScale]); 
                ctx.stroke();
                ctx.setLineDash([]); 

                const fontSize = 14 / globalScale;
                ctx.font = `bold ${fontSize}px Sans-Serif`;
                ctx.fillStyle = cluster.color;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText(cluster.name, centerX, minY - 10);
             });
        }}
        
        linkWidth={link => Math.min(Math.log((link as any).value + 1) + 1, 5)}
        linkDirectionalParticles={2}
        onNodeClick={(node) => setSelectedNode(node as any)}
        onLinkClick={(link) => setSelectedLink(link as any)}
        onBackgroundClick={() => { setSelectedNode(null); setSelectedLink(null); }}
      />
    </div>
  );
};

// [핵심 수정] React.memo로 감싸서 export
export default React.memo(NetworkGraph);