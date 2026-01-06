import { useState, useEffect } from 'react';
import { useGlobalStore } from '../../stores/useGlobalStore';

export const ClusterPanel = () => {
  const [clusterName, setClusterName] = useState('');
  const { graphData, clusters, createCluster, deleteCluster, removeNode, setSelectedNode } = useGlobalStore();
  const [selectedForCluster, setSelectedForCluster] = useState<Set<string>>(new Set());
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null); // [New] 아코디언 펼침 상태
  const [isCreating, setIsCreating] = useState(false);

  const handleNodeClick = (nodeId: string) => {
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (node) setSelectedNode(node); // 맵에서 하이라이트
  };

  // [New] 전체 선택 토글
  const toggleSelectAll = () => {
    if (selectedForCluster.size === graphData.nodes.length) {
      setSelectedForCluster(new Set()); // 전체 해제
    } else {
      // 모든 노드 ID 선택
      setSelectedForCluster(new Set(graphData.nodes.map(n => n.id)));
    }
  };

  // 노드가 삭제되거나 바뀌면 선택 상태 정리
  useEffect(() => {
    const newSet = new Set<string>();
    selectedForCluster.forEach(id => {
      if (graphData.nodes.find(n => n.id === id)) newSet.add(id);
    });
    setSelectedForCluster(newSet);
  }, [graphData.nodes.length]);

  // 체크박스 핸들링
  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedForCluster);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedForCluster(newSet);
  };

  const handleCreate = () => {
    if (!clusterName || selectedForCluster.size === 0) return;
    createCluster(clusterName, Array.from(selectedForCluster));
    setClusterName('');
    setSelectedForCluster(new Set());
    setIsCreating(false);
  };

  return (
    <div className="absolute bottom-4 left-4 w-80 bg-white/95 backdrop-blur border border-blue-100 shadow-xl rounded-xl p-4 z-20 flex flex-col max-h-[400px]">
      <h3 className="text-sm font-bold text-slate-700 mb-3 flex justify-between items-center">
        <span>📦 Node Manager</span>
        <span className="text-xs text-slate-400">{graphData.nodes.length} nodes</span>
      </h3>

      {/* 클러스터 목록 (아코디언 스타일) */}
      <div className="space-y-2 mb-4 overflow-y-auto max-h-48 custom-scrollbar">
        {clusters.map(c => (
          <div key={c.id} className="border border-slate-200 rounded bg-slate-50 overflow-hidden">
            {/* 클러스터 헤더 */}
            <div 
              className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-slate-100 transition-colors"
              onClick={() => setExpandedClusterId(expandedClusterId === c.id ? null : c.id)}
            >
              <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }}></div>
                 <span className="text-xs font-bold text-slate-700">{c.name}</span>
                 <span className="text-[10px] text-slate-400">({c.nodeIds.length})</span>
              </div>
              <div className="flex items-center gap-2">
                 {/* 펼침 화살표 */}
                 <span className="text-xs text-slate-400">{expandedClusterId === c.id ? '▲' : '▼'}</span>
                 <button 
                   onClick={(e) => { e.stopPropagation(); deleteCluster(c.id); }} 
                   className="text-slate-400 hover:text-red-500 text-sm px-1"
                 >×</button>
              </div>
            </div>

            {/* 펼쳐졌을 때 내부 주소 리스트 */}
            {expandedClusterId === c.id && (
              <div className="bg-white border-t border-slate-100 p-2 space-y-1">
                {c.nodeIds.map(nodeId => (
                  <div 
                    key={nodeId} 
                    onClick={() => handleNodeClick(nodeId)}
                    className="flex justify-between items-center text-[10px] p-1 hover:bg-blue-50 rounded cursor-pointer group"
                  >
                    <span className="font-mono text-slate-600 truncate w-40">{nodeId}</span>
                    <span className="text-blue-400 opacity-0 group-hover:opacity-100 text-[9px]">Locate</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 1. 클러스터 생성 모드 UI */}
      {isCreating ? (
        <div className="mb-3 p-2 bg-blue-50 rounded border border-blue-100">
          <input
            type="text"
            placeholder="Cluster Name (e.g., Scam Group A)"
            className="w-full text-xs p-1 border rounded mb-2"
            value={clusterName}
            onChange={e => setClusterName(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} className="flex-1 bg-blue-600 text-white text-xs py-1 rounded">Confirm</button>
            <button onClick={() => setIsCreating(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs py-1 rounded">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 mb-3">
             <button 
                onClick={() => setIsCreating(true)}
                disabled={selectedForCluster.size < 2}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-1.5 rounded disabled:opacity-50 transition-colors"
             >
               + Group Selected ({selectedForCluster.size})
             </button>
             {/* [New] 전체 선택 버튼 */}
             <button
               onClick={toggleSelectAll}
               className="px-3 bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-100"
             >
               {selectedForCluster.size === graphData.nodes.length ? 'Deselect All' : 'Select All'}
             </button>
        </div>
      )}

      {/* 3. 노드 리스트 (스크롤) */}
      <div className="flex-1 overflow-y-auto space-y-1 border-t border-slate-100 pt-2">
        {graphData.nodes.map(node => (
          <div key={node.id} className="flex items-center justify-between group hover:bg-slate-50 p-1 rounded">
            <div className="flex items-center gap-2 overflow-hidden">
              <input 
                type="checkbox" 
                checked={selectedForCluster.has(node.id)}
                onChange={() => toggleSelection(node.id)}
                className="rounded border-slate-300"
              />
              <span className={`text-xs font-mono truncate w-40 ${node.group === 'risk' ? 'text-red-500' : 'text-slate-600'}`}>
                {node.label || node.id}
              </span>
            </div>
            {/* 개별 삭제 버튼 (호버 시 등장) */}
            <button 
                onClick={() => removeNode(node.id)}
                className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-600 px-1"
            >
                Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};