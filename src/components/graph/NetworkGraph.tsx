import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import * as d3 from 'd3-force';
import { useGlobalStore } from '../../stores/useGlobalStore';

const NetworkGraph = () => {
  const {
    graphData,
    clusters,
    selectedNode,
    setSelectedNode,
    setSelectedLink,
    layoutMode,
    isPhysicsActive,
    selectedIds,
    selectNodesByIds,
    clearSelection,
    toggleSelectNode,
    setPendingClusterNodes
  } = useGlobalStore();

  const graphRef = useRef<any>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 그룹 드래그 상태
  const dragState = useRef<{
    peers: Array<{ node: any; offsetX: number; offsetY: number }>;
  } | null>(null);

  // 박스 선택 상태
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  // Shift 키 & 메뉴 상태
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [showInstruction, setShowInstruction] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Shift Key Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
      if (e.key === 'Escape') {
          clearSelection();
          setContextMenu(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Physics
  useEffect(() => {
    if (graphRef.current) {
      const fg = graphRef.current;

      if (layoutMode === 'horizontal') {
        fg.d3Force('collide', d3.forceCollide(12));
        fg.d3Force('cluster', null);
        fg.d3Force('charge').strength(-50);
        fg.d3Force('link').distance(30);
      } else {
        fg.d3Force('charge').strength(-60);
        fg.d3Force('link').distance(25);

        const clusterForce = (alpha: number) => {
          const nodes = graphData.nodes;
          const clusterMap = new Map();

          clusters.forEach(cluster => {
            const members = nodes.filter((n: any) => n.clusterId === cluster.id);
            if (members.length === 0) return;

            let sx = 0, sy = 0;
            members.forEach((n: any) => { sx += n.x || 0; sy += n.y || 0; });
            const cx = sx / members.length;
            const cy = sy / members.length;

            let maxDist = 0;
            members.forEach((n: any) => {
              const dx = (n.x || 0) - cx;
              const dy = (n.y || 0) - cy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > maxDist) maxDist = dist;
            });
            clusterMap.set(cluster.id, { x: cx, y: cy, radius: maxDist + 15 });
          });

          nodes.forEach((node: any) => {
            if (node.clusterId) {
              const center = clusterMap.get(node.clusterId);
              if (center) {
                const strength = 0.8 * alpha;
                node.vx += (center.x - node.x) * strength;
                node.vy += (center.y - node.y) * strength;
              }
            }
            clusterMap.forEach((center, clusterId) => {
              if (node.clusterId !== clusterId) {
                const dx = node.x - center.x;
                const dy = node.y - center.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                if (dist < center.radius) {
                  const strength = 2.0 * alpha;
                  const pushX = (dx / dist) * (center.radius - dist) * strength;
                  const pushY = (dy / dist) * (center.radius - dist) * strength;
                  node.vx += pushX;
                  node.vy += pushY;
                }
              }
            });
          });
        };
        fg.d3Force('cluster', clusterForce);
        fg.d3Force('collide', d3.forceCollide((node: any) => node.clusterId ? 8 : 15).iterations(4));
      }

      if (isPhysicsActive) {
        fg.d3ReheatSimulation();
      }
    }
  }, [graphData, clusters, layoutMode, isPhysicsActive]);

  // Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    if (e.shiftKey) {
      e.preventDefault();
      setIsSelecting(true);
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        dragStartPos.current = { x, y };
        setSelectionBox({ x, y, w: 0, h: 0 });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSelecting && dragStartPos.current && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      const startX = dragStartPos.current.x;
      const startY = dragStartPos.current.y;
      setSelectionBox({
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        w: Math.abs(currentX - startX),
        h: Math.abs(currentY - startY)
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isSelecting && selectionBox && graphRef.current) {
      const { x, y, w, h } = selectionBox;
      const fg = graphRef.current;
      const nodesInBox: string[] = [];
      graphData.nodes.forEach((node: any) => {
        const coords = fg.graph2ScreenCoords(node.x, node.y);
        if (coords.x >= x && coords.x <= x + w && coords.y >= y && coords.y <= y + h) {
          nodesInBox.push(node.id);
        }
      });
      if (nodesInBox.length > 0) selectNodesByIds(nodesInBox);
      else clearSelection();
    }
    setIsSelecting(false);
    setSelectionBox(null);
    dragStartPos.current = null;
  };

  const handleBackgroundClick = (e: any) => {
      if (e.shiftKey) return;
      setContextMenu(null);

      const fg = graphRef.current;
      if (!fg) return;

      const graphCoords = fg.screen2GraphCoords(e.clientX, e.clientY);
      const clickX = graphCoords.x;
      const clickY = graphCoords.y;

      let clickedClusterId: string | null = null;

      for (const cluster of clusters) {
          const members = graphData.nodes.filter(n => n.clusterId === cluster.id);
          if (members.length === 0) continue;

          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          
          members.forEach(n => {
              if (typeof n.x !== 'number' || typeof n.y !== 'number') return;
              minX = Math.min(minX, n.x);
              maxX = Math.max(maxX, n.x);
              minY = Math.min(minY, n.y);
              maxY = Math.max(maxY, n.y);
          });

          if (minX === Infinity) continue;

          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const radius = Math.max(maxX - minX, maxY - minY) / 2 + 15;

          const dist = Math.sqrt((clickX - centerX)**2 + (clickY - centerY)**2);
          
          if (dist <= radius) {
              clickedClusterId = cluster.id;
              break;
          }
      }

      if (clickedClusterId) {
          const memberIds = graphData.nodes
              .filter(n => n.clusterId === clickedClusterId)
              .map(n => n.id);
          selectNodesByIds(memberIds);
      } else {
          clearSelection();
      }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault(); 
      e.stopPropagation();
      if (selectedIds.size === 0) return;
      const rect = wrapperRef.current?.getBoundingClientRect();
      if (rect) {
          setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
  };

  const handleAddToCluster = () => {
      setPendingClusterNodes(Array.from(selectedIds));
      setContextMenu(null);
  };

  const onNodeDragStart = (node: any) => {
    if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
    const peersIds = new Set<string>();
    
    if (node.clusterId) {
      graphData.nodes.forEach(n => {
        if (n.clusterId === node.clusterId && n.id !== node.id) peersIds.add(n.id);
      });
    }
    if (selectedIds.has(node.id)) {
      selectedIds.forEach(id => {
        if (id !== node.id) peersIds.add(id);
      });
    }

    const peersData: Array<{ node: any; offsetX: number; offsetY: number }> = [];
    peersIds.forEach(id => {
      const peer = graphData.nodes.find(n => n.id === id);
      if (peer && typeof peer.x === 'number' && typeof peer.y === 'number') {
        peersData.push({ node: peer, offsetX: peer.x - node.x, offsetY: peer.y - node.y });
        peer.fx = peer.x;
        peer.fy = peer.y;
      }
    });
    dragState.current = { peers: peersData };
  };

  const onNodeDrag = (node: any) => {
    if (!dragState.current) return;
    if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
    const { peers } = dragState.current;
    peers.forEach(p => {
       const targetX = node.x + p.offsetX;
       const targetY = node.y + p.offsetY;
       p.node.fx = targetX;
       p.node.fy = targetY;
       p.node.x = targetX;
       p.node.y = targetY;
    });
  };

  const onNodeDragEnd = (node: any) => {
    dragState.current = null;
  };

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-screen bg-slate-50 overflow-hidden select-none"
      style={{ cursor: isShiftPressed ? 'crosshair' : 'default' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <ForceGraph2D
        ref={graphRef}
        graphData={graphData}
        backgroundColor="#f8fafc"
        
        enableNodeDrag={true}
        enablePanInteraction={!isShiftPressed}
        enableZoomInteraction={!isShiftPressed}
        
        onNodeDrag={onNodeDrag}
        onNodeDragEnd={onNodeDragEnd}
        // @ts-ignore
        onNodeDragStart={onNodeDragStart}

        linkWidth={link => {
            const val = (link as any).value || 0;
            return Math.min(2 + Math.log(val + 1) * 0.7, 10);
        }}
        linkDirectionalArrowLength={4} 
        linkDirectionalArrowRelPos={1}
        linkDirectionalParticles={3}
        linkDirectionalParticleWidth={link => {
            const val = (link as any).value || 0;
            if (val > 50000) return 6;
            if (val > 1000) return 4;
            return 2;
        }}
        linkDirectionalParticleSpeed={0.01}

        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const cluster = clusters.find(c => c.id === node.clusterId);
          const isMultiSelected = selectedIds.has(node.id);
          const isSelected = selectedNode?.id === node.id || isMultiSelected;
          const isStart = node.isStart;
          const isDbMatched = node.isTerminal === true;
          const r = isStart ? 12 : isDbMatched ? 10 : 6;

          if (isStart) {
            const time = Date.now();
            const pulse = (time % 2000) / 2000;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + pulse * r * 4, 0, 2 * Math.PI);
            ctx.strokeStyle = `rgba(6, 182, 212, ${1 - pulse})`;
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }

          if (isDbMatched) {
            const pulse = Math.abs(Math.sin(Date.now() / 200)) * 10 + 15;
            ctx.shadowColor = '#3b82f6';
            ctx.shadowBlur = pulse;
          } else {
            ctx.shadowBlur = 0;
          }

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r * 2.0, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
            ctx.fill();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = node.customColor || (isStart ? '#06b6d4' : node.group === 'exchange' ? '#3b82f6' : node.isTerminal ? '#ef4444' : '#22c55e');
          ctx.fill();

          ctx.strokeStyle = '#fff';
          if (cluster) {
            ctx.strokeStyle = cluster.color;
            ctx.lineWidth = 2.5 / globalScale;
          } else {
            ctx.lineWidth = 1.5 / globalScale;
          }
          ctx.stroke();

          if (isStart || isDbMatched) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${r}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(isStart ? 'S' : '!', node.x, node.y + 1 / globalScale);
          }

          const fontSize = 10 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowBlur = 0;

          const label = node.memo || node.label || node.id.slice(0, 4);
          if (node.memo) {
            const memoText = node.memo.length > 8 ? node.memo.slice(0, 8) + '...' : node.memo;
            const textY = node.y - r - fontSize * 1.5;
            ctx.fillStyle = '#fef08a';
            const w = ctx.measureText(memoText).width;
            ctx.fillRect(node.x - w / 2 - 2, textY - fontSize / 2 - 2, w + 4, fontSize + 4);
            ctx.fillStyle = '#854d0e';
            ctx.fillText(memoText, node.x, textY);
          } else {
            ctx.fillStyle = isStart || isDbMatched ? '#1e293b' : '#475569';
            if (isDbMatched) ctx.font = `bold ${fontSize}px Sans-Serif`;
            ctx.fillText(label, node.x, node.y + r + fontSize + 3);
          }
        }}

        onRenderFramePre={(ctx, globalScale) => {
          clusters.forEach(cluster => {
            const nodesInCluster = graphData.nodes.filter(n => n.clusterId === cluster.id);
            if (nodesInCluster.length === 0) return;

            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            nodesInCluster.forEach((n: any) => {
              if (typeof n.x !== 'number') return;
              minX = Math.min(minX, n.x);
              maxX = Math.max(maxX, n.x);
              minY = Math.min(minY, n.y);
              maxY = Math.max(maxY, n.y);
            });

            if (minX === Infinity) return;

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const radius = Math.max(maxX - minX, maxY - minY) / 2 + 15;

            const isClusterSelected = nodesInCluster.every(n => selectedIds.has(n.id));

            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
            
            if (isClusterSelected) {
                ctx.shadowColor = cluster.color;
                ctx.shadowBlur = 20; 
                ctx.fillStyle = cluster.color + '20'; 
            } else {
                ctx.shadowBlur = 0;
                ctx.fillStyle = cluster.color + '10';
            }

            ctx.fill();
            
            ctx.strokeStyle = cluster.color;
            ctx.lineWidth = (isClusterSelected ? 4 : 1.5) / globalScale; 
            
            if (!isClusterSelected) {
                ctx.setLineDash([6 / globalScale, 4 / globalScale]); 
            } else {
                ctx.setLineDash([]); 
            }
            ctx.stroke();
            ctx.setLineDash([]); 
            ctx.shadowBlur = 0;

            const fontSize = (isClusterSelected ? 18 : 14) / globalScale;
            ctx.font = `bold ${fontSize}px Sans-Serif`;
            ctx.fillStyle = cluster.color;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(cluster.name, centerX, minY - 8);
          });
        }}

        onNodeClick={(node, event) => {
          if ((event as any).shiftKey) toggleSelectNode((node as any).id, true);
          else toggleSelectNode((node as any).id, false);
        }}
        onLinkClick={link => setSelectedLink(link as any)}
        
        onBackgroundClick={handleBackgroundClick}

        cooldownTicks={isPhysicsActive ? Infinity : 0}
        dagMode={layoutMode === 'horizontal' ? 'lr' : undefined}
        dagLevelDistance={150} 
      />

      {selectionBox && (
        <div
          className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
          style={{
            left: selectionBox.x,
            top: selectionBox.y,
            width: selectionBox.w,
            height: selectionBox.h
          }}
        />
      )}

      {contextMenu && (
        <div 
          // [핵심 해결책] 마우스 다운 이벤트를 여기서 멈춰서 배경이 감지하지 못하게 함
          onMouseDown={(e) => e.stopPropagation()} 
          className="absolute z-[100] bg-white/95 backdrop-blur rounded-lg shadow-xl border border-slate-200 py-1 min-w-[160px] animate-in zoom-in-95 duration-100 origin-top-left"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 rounded-t-lg">
             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Selection</div>
             <div className="text-xs font-bold text-slate-800">{selectedIds.size} Nodes</div>
          </div>
          <button 
             onClick={handleAddToCluster}
             className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center gap-2"
          >
             <span className="text-sm">✨</span> Add to Cluster
          </button>
          <div className="px-3 py-1 text-[9px] text-slate-300">More options soon...</div>
        </div>
      )}

      {showInstruction && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur text-white text-[11px] pl-4 pr-2 py-1.5 rounded-full z-[40] shadow-lg flex items-center gap-3 animate-fade-in-down border border-slate-600">
          <span>
            Hold <b className="text-yellow-400">Shift</b> + Drag to Select <span className="mx-1 text-slate-400">|</span> Right Click to Cluster
          </span>
          <button
            onClick={() => setShowInstruction(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-700 rounded-full p-0.5 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default React.memo(NetworkGraph);