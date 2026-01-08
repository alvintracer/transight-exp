import { useState, useMemo, useEffect } from 'react';
import { useGlobalStore } from '../../stores/useGlobalStore';

export const ClusterPanel = () => {
  const { 
    graphData, clusters, addCluster, removeCluster, updateCluster, 
    pendingClusterNodes, clearPendingClusterNodes 
  } = useGlobalStore();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [clusterName, setClusterName] = useState('');
  const [clusterColor, setClusterColor] = useState('#8b5cf6');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // [중요] 이 useEffect가 있어야 NetworkGraph에서 보낸 신호를 받습니다.
  useEffect(() => {
    if (pendingClusterNodes.length > 0) {
        setMode('create');
        setEditingId(null);
        setClusterName('');
        setClusterColor(`#${Math.floor(Math.random()*16777215).toString(16)}`);
        
        setSelectedIds(new Set(pendingClusterNodes));
        setIsModalOpen(true);
        
        clearPendingClusterNodes();
    }
  }, [pendingClusterNodes, clearPendingClusterNodes]);
  const candidateNodes = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();
    if (!lowerSearch) {
        return graphData.nodes.filter(n => 
            (n.group === 'target' || n.group === 'risk' || n.group === 'exchange')
        );
    }
    return graphData.nodes.filter(n => {
        const id = n.id ? n.id.toLowerCase() : '';
        const label = n.label ? n.label.toLowerCase() : '';
        const memo = n.memo ? n.memo.toLowerCase() : '';
        const idMatch = id.includes(lowerSearch);
        const labelMatch = label.includes(lowerSearch);
        const memoMatch = memo.includes(lowerSearch);
        return (idMatch || labelMatch || memoMatch) && n.id;
    });
  }, [graphData.nodes, search]);

  const handleToggleNode = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
      const selectableNodes = candidateNodes.filter(n => !n.clusterId || n.clusterId === editingId);
      if (selectableNodes.length === 0) return;
      const allSelected = selectableNodes.every(n => selectedIds.has(n.id));
      const next = new Set(selectedIds);
      if (allSelected) selectableNodes.forEach(n => next.delete(n.id));
      else selectableNodes.forEach(n => next.add(n.id));
      setSelectedIds(next);
  };

  const openCreateModal = () => {
      setMode('create');
      setEditingId(null);
      setClusterName('');
      setClusterColor(`#${Math.floor(Math.random()*16777215).toString(16)}`);
      setSelectedIds(new Set());
      setSearch('');
      setIsModalOpen(true);
  };

  const openEditModal = (cluster: any) => {
      setMode('edit');
      setEditingId(cluster.id);
      setClusterName(cluster.name);
      setClusterColor(cluster.color);
      setSelectedIds(new Set(cluster.nodeIds));
      setSearch('');
      setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!clusterName.trim()) { alert("Enter name"); return; }
    if (selectedIds.size < 2) { alert("Min 2 nodes"); return; }

    if (mode === 'create') {
        addCluster(clusterName, clusterColor, Array.from(selectedIds));
    } else if (mode === 'edit' && editingId) {
        updateCluster(editingId, clusterName, clusterColor, Array.from(selectedIds));
    }

    setIsModalOpen(false);
    setClusterName('');
    setSelectedIds(new Set());
  };

  return (
    <>
      <div className="absolute bottom-6 left-6 flex flex-col gap-2 z-40 pointer-events-none">
        
        {isModalOpen && (
            <div className="pointer-events-auto bg-white/95 backdrop-blur-xl w-[350px] rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 mb-2">
                <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 text-sm">
                        {mode === 'create' ? '✨ New Cluster' : '🛠️ Edit Cluster'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <div className="p-3 space-y-3">
                   <div className="flex gap-2">
                       <div className="flex-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Name</label>
                          <input 
                            type="text" value={clusterName} onChange={e => setClusterName(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs focus:outline-blue-500"
                            placeholder="Cluster Name" autoFocus
                          />
                       </div>
                       <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color</label>
                          <div className="flex items-center gap-1 h-[26px]">
                              <input 
                                type="color" value={clusterColor} onChange={e => setClusterColor(e.target.value)}
                                className="w-8 h-full rounded cursor-pointer border-0 p-0 shadow-sm"
                              />
                          </div>
                       </div>
                   </div>

                   <div>
                      <div className="flex justify-between items-end mb-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase pb-1">
                              Members ({selectedIds.size})
                          </label>
                          <div className="flex items-center gap-2">
                              <button onClick={handleSelectAll} className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded transition-colors">Select All</button>
                              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-24 border border-slate-200 rounded px-1.5 py-0.5 text-[10px] bg-slate-50 focus:bg-white" />
                          </div>
                      </div>
                      
                      <div className="h-40 overflow-y-auto border border-slate-200 rounded bg-slate-50 p-1 custom-scrollbar">
                          {candidateNodes.length === 0 ? (
                              <div className="text-center text-xs text-slate-400 py-8">{search ? "No matching nodes." : "No available nodes."}</div>
                          ) : (
                              candidateNodes.map(node => {
                                  const isChecked = selectedIds.has(node.id);
                                  const inOther = node.clusterId && node.clusterId !== editingId;
                                  return (
                                      <div 
                                        key={node.id} 
                                        onClick={() => !inOther && handleToggleNode(node.id)}
                                        className={`flex items-center gap-2 p-1.5 rounded mb-0.5 transition-colors ${inOther ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${isChecked ? 'bg-blue-50 border border-blue-200' : 'hover:bg-white border border-transparent'}`}
                                      >
                                          <div className={`w-3 h-3 rounded border flex items-center justify-center ${isChecked ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                              {isChecked && <span className="text-white text-[8px] font-bold">✓</span>}
                                          </div>
                                          <div className="overflow-hidden flex-1 leading-none">
                                              <div className="flex items-center gap-1 mb-0.5">
                                                  <span className="text-[11px] font-bold text-slate-700 truncate max-w-[100px]">{node.label || node.id.slice(0,6)}</span>
                                                  {node.memo && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded truncate max-w-[60px]">{node.memo}</span>}
                                              </div>
                                              <div className="text-[9px] text-slate-400 font-mono truncate">{node.id}</div>
                                          </div>
                                      </div>
                                  )
                              })
                          )}
                      </div>
                   </div>
                </div>

                <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
                    <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700">Cancel</button>
                    <button onClick={handleSave} disabled={!clusterName || selectedIds.size < 2} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 py-1.5 rounded text-xs font-bold transition-colors shadow-sm">{mode === 'create' ? 'Create' : 'Update'}</button>
                </div>
            </div>
        )}

        <button onClick={openCreateModal} className="pointer-events-auto bg-slate-900 text-white py-2 px-4 rounded-full shadow-lg font-bold text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2 self-start ring-1 ring-white/20"><span>✨ New Cluster</span></button>

        {!isModalOpen && (
            <div className="pointer-events-auto space-y-2 overflow-y-auto custom-scrollbar pr-1 pb-2 max-h-[30vh]">
            {clusters.map(cluster => (
                <div key={cluster.id} onClick={() => openEditModal(cluster)} className="bg-white/90 backdrop-blur border-l-4 p-2.5 rounded shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer group relative" style={{ borderLeftColor: cluster.color }}>
                <div className="flex justify-between items-center mb-0.5">
                    <span className="font-bold text-slate-700 text-xs truncate max-w-[180px]" style={{color: cluster.color}}>{cluster.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); if(confirm('Dissolve?')) removeCluster(cluster.id); }} className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded px-1.5 transition-all">✕</button>
                </div>
                <div className="text-[10px] text-slate-500 font-mono">{cluster.nodeIds.length} Nodes</div>
                </div>
            ))}
            </div>
        )}
      </div>
    </>
  );
};