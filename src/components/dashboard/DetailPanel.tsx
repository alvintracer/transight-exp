import { useEffect, useState } from 'react';
import { useGlobalStore } from '../../stores/useGlobalStore';
import { fetchAccountDetail, fetchRecentHistory, type AccountDetail, type CleanTx } from '../../services/tronScanner';
import { checkAddressesRisk } from '../../services/riskChecker';

export const DetailPanel = () => {
  const { selectedNode, selectedLink, setSelectedNode, setSelectedLink, removeNode, updateNode, addNodes } = useGlobalStore();
  const [accountInfo, setAccountInfo] = useState<AccountDetail | null>(null);
  const [history, setHistory] = useState<(CleanTx & { riskLabel?: string })[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [memoInput, setMemoInput] = useState('');
  const [colorInput, setColorInput] = useState('#22c55e');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const linkTxs: CleanTx[] = selectedLink ? (selectedLink as any).txDetails || [] : [];

  // [New] 링크 내 코인별 합계 계산
  const totalUSDT = linkTxs.filter(tx => tx.token === 'USDT').reduce((acc, cur) => acc + cur.amount, 0);
  const totalTRX = linkTxs.filter(tx => tx.token === 'TRX').reduce((acc, cur) => acc + cur.amount, 0);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2000);
  };

  const handleClose = () => {
    setSelectedNode(null);
    setSelectedLink(null);
  };

  useEffect(() => {
    if (selectedNode) {
      setMemoInput(selectedNode.memo || '');
      setColorInput(selectedNode.customColor || (selectedNode.group === 'risk' ? '#ef4444' : selectedNode.group === 'exchange' ? '#3b82f6' : '#22c55e'));
      setLoading(true);
      
      Promise.all([
          fetchAccountDetail(selectedNode.id),
          fetchRecentHistory(selectedNode.id)
      ]).then(async ([info, txs]) => {
        setAccountInfo(info);
        
        const inAddresses = txs.filter(tx => tx.receiver === selectedNode.id).map(tx => tx.sender);
        const riskMap = await checkAddressesRisk(inAddresses);
        
        const enrichedTxs = txs.map(tx => {
           if (tx.receiver === selectedNode.id) {
               const risk = riskMap.get(tx.sender);
               return { ...tx, riskLabel: risk?.label };
           }
           return tx;
        });

        setHistory(enrichedTxs);
        setLoading(false);
      });
    }
  }, [selectedNode?.id]);

  const handleSaveMemo = () => {
    if (selectedNode) {
      updateNode(selectedNode.id, { memo: memoInput });
      showToast('✅ Memo Saved!');
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setColorInput(newColor);
    if (selectedNode) updateNode(selectedNode.id, { customColor: newColor });
  };

  const handleCopy = (text: string, label: string) => {
      navigator.clipboard.writeText(text);
      showToast(`📋 ${label} Copied!`);
  };

  const handleAddFromHistory = (address: string) => {
      addNodes([{
          id: address,
          group: 'target',
          val: 10,
          isTerminal: false,
          createdAt: Date.now()
      }]);
      showToast('🚀 Trace Started');
  };

  if (!selectedNode && !selectedLink) return null;

  return (
    <>
    {toastMsg && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-4 py-2 rounded-full shadow-lg text-sm z-[70] animate-fade-in-up pointer-events-none">
            {toastMsg}
        </div>
    )}

    <div className="absolute right-4 top-16 bottom-4 w-[420px] bg-white/95 backdrop-blur-md border border-slate-300 shadow-2xl rounded-xl z-[60] flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
      
      {/* 헤더 */}
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white shadow-sm z-10">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          {selectedNode ? '📍 Node Inspector' : '🔗 Link Inspector'}
        </h2>
        <div className="flex gap-2">
            {selectedNode && (
                <button 
                    onClick={() => { if(confirm('Delete node?')) { removeNode(selectedNode.id); handleClose(); } }}
                    className="text-xs text-red-500 hover:bg-red-50 border border-red-200 px-3 py-1.5 rounded transition-colors font-bold"
                >
                    Delete Node
                </button>
            )}
            <button 
                onClick={handleClose} 
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-bold transition-colors"
            >
                Close ✕
            </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50">
        {/* CASE 1: 노드 정보 */}
        {selectedNode && (
            <div className="space-y-6">
                
                {/* 1. 메모 & 색상 */}
                <div className="flex gap-2 items-end bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex-1">
                        <label className="text-[10px] text-slate-500 uppercase font-bold">Memo</label>
                        <div className="flex gap-1 mt-1">
                            <input 
                                type="text" 
                                value={memoInput}
                                onChange={e => setMemoInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSaveMemo()}
                                className="flex-1 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-sm focus:border-yellow-500 outline-none"
                                placeholder="Tag (displayed on map)..."
                            />
                            <button onClick={handleSaveMemo} className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-2 rounded text-xs font-bold">Save</button>
                        </div>
                    </div>
                    <div className="flex flex-col items-center">
                        <label className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Color</label>
                        <input type="color" value={colorInput} onChange={handleColorChange} className="w-8 h-8 rounded cursor-pointer border-0 p-0 shadow-sm" />
                    </div>
                </div>

                {/* 2. 주소 정보 */}
                <div>
                   <div className="text-xs text-slate-500 uppercase font-bold mb-1 ml-1">Address</div>
                   <div 
                     onClick={() => handleCopy(selectedNode.id, "Address")}
                     className="text-sm font-mono break-all text-blue-600 cursor-pointer hover:bg-white bg-white p-3 rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-blue-300"
                     title="Click to copy"
                   >
                     {selectedNode.id}
                   </div>
                </div>

                {/* 3. 밸런스 정보 */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-green-600 uppercase font-bold mb-1">USDT (TRC20)</div>
                        <div className="text-lg font-bold text-slate-800 truncate">
                            {loading ? '...' : accountInfo?.balance_usdt.toLocaleString()} <span className="text-xs text-slate-400 font-normal">$</span>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-blue-600 uppercase font-bold mb-1">TRX Balance</div>
                        <div className="text-lg font-bold text-slate-800 truncate">
                            {loading ? '...' : accountInfo?.balance_trx.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* 4. 노드 트랜잭션 리스트 */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                   <h3 className="text-xs font-bold text-slate-700 p-3 border-b border-slate-100 flex justify-between bg-slate-50">
                       <span>Recent Transactions</span>
                       <span className="font-normal text-slate-400">{history.length} items</span>
                   </h3>
                   <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-xs text-left table-fixed">
                          <tbody className="divide-y divide-slate-100">
                             {loading ? <tr><td colSpan={3} className="p-4 text-center text-slate-400">Loading history...</td></tr> : 
                              history.length === 0 ? <tr><td colSpan={3} className="p-4 text-center text-slate-400">No transactions {'>'} 1.0</td></tr> :
                              history.map((tx) => {
                                  const isIn = tx.receiver === selectedNode.id;
                                  const otherAddr = isIn ? tx.sender : tx.receiver;
                                  const date = new Date(tx.timestamp).toLocaleString(undefined, {
                                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  });
                                  
                                  return (
                                      <tr key={tx.txID} className="hover:bg-slate-50 transition-colors">
                                          <td className="p-3 align-top w-24">
                                              <div className="flex items-center gap-1 mb-1">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isIn ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                                                    {isIn ? 'IN' : 'OUT'}
                                                </span>
                                              </div>
                                              <div className="text-[9px] text-slate-400 leading-tight">{date}</div>
                                          </td>
                                          <td className="p-3 align-top w-auto overflow-hidden">
                                              <div className="flex items-center gap-1 mb-1">
                                                <div 
                                                    onClick={() => handleCopy(otherAddr, "Address")}
                                                    className="font-mono text-slate-700 cursor-pointer hover:text-blue-600 truncate font-medium"
                                                    title={otherAddr}
                                                >
                                                    {otherAddr.slice(0, 6)}...{otherAddr.slice(-4)}
                                                </div>
                                                {tx.riskLabel && (
                                                    <span className="bg-red-100 text-red-600 text-[9px] px-1.5 rounded-full font-bold truncate max-w-[60px] border border-red-200">
                                                        {tx.riskLabel}
                                                    </span>
                                                )}
                                              </div>
                                              {isIn && (
                                                <button onClick={() => handleAddFromHistory(otherAddr)} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 rounded hover:bg-blue-100 mb-1 inline-block">
                                                    + Trace
                                                </button>
                                              )}
                                              <div 
                                                onClick={() => handleCopy(tx.txID, "TX Hash")}
                                                className="text-[9px] text-slate-400 font-mono cursor-pointer hover:text-slate-600 hover:underline truncate"
                                                title={`TX: ${tx.txID}`}
                                              >
                                                  TX: {tx.txID.slice(0, 8)}...
                                              </div>
                                          </td>
                                          <td className="p-3 text-right align-top w-24 font-bold text-slate-700">
                                              {tx.amount < 1000 ? tx.amount.toFixed(1) : Math.floor(tx.amount).toLocaleString()}
                                              <span className="text-[9px] text-slate-400 block font-normal">{tx.token}</span>
                                          </td>
                                      </tr>
                                  )
                              })}
                          </tbody>
                      </table>
                   </div>
                </div>
            </div>
        )}

        {/* CASE 2: 링크(엣지) 정보 */}
        {selectedLink && (
            <div className="space-y-4">
                
                {/* [New] 합계 요약 (그리드 형태) */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-green-600 uppercase font-bold mb-1">Total USDT</div>
                        <div className="text-lg font-black text-slate-800 tracking-tight">
                            {totalUSDT.toLocaleString()} <span className="text-xs font-normal text-slate-400">$</span>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <div className="text-[10px] text-blue-600 uppercase font-bold mb-1">Total TRX</div>
                        <div className="text-lg font-black text-slate-800 tracking-tight">
                            {totalTRX.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* 연결 정보 */}
                <div className="flex items-center justify-between text-xs bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <div className="flex flex-col w-24">
                        <span className="text-[9px] text-slate-400 uppercase font-bold mb-1">From</span>
                        <span 
                            className="font-mono truncate cursor-pointer hover:text-blue-600 bg-slate-50 p-1 rounded" 
                            title={(selectedLink.source as any).id}
                            onClick={() => handleCopy((selectedLink.source as any).id, "Address")}
                        >
                            {(selectedLink.source as any).id}
                        </span>
                    </div>
                    <span className="text-slate-300">──▶</span>
                    <div className="flex flex-col w-24 text-right">
                        <span className="text-[9px] text-slate-400 uppercase font-bold mb-1">To</span>
                        <span 
                            className="font-mono truncate cursor-pointer hover:text-blue-600 bg-slate-50 p-1 rounded" 
                            title={(selectedLink.target as any).id}
                            onClick={() => handleCopy((selectedLink.target as any).id, "Address")}
                        >
                            {(selectedLink.target as any).id}
                        </span>
                    </div>
                </div>

                {/* 상세 트랜잭션 테이블 */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                   <h3 className="text-xs font-bold text-slate-700 p-3 border-b border-slate-100 bg-slate-50 flex justify-between">
                       <span>Included Transactions</span>
                       <span className="font-normal text-slate-400">{linkTxs.length} items</span>
                   </h3>
                   <div className="max-h-80 overflow-y-auto">
                      <table className="w-full text-xs text-left table-fixed">
                          <tbody className="divide-y divide-slate-100">
                              {linkTxs.length === 0 ? (
                                  <tr><td colSpan={3} className="p-4 text-center text-slate-400">No details available</td></tr>
                              ) : (
                                  linkTxs.map((tx: any) => {
                                      const date = new Date(tx.timestamp).toLocaleString(undefined, {
                                          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                      });
                                      return (
                                          <tr key={tx.txID} className="hover:bg-slate-50">
                                              <td className="p-3 text-[10px] text-slate-500 w-24 align-top">{date}</td>
                                              <td className="p-3 w-auto align-top">
                                                  <div 
                                                    className="font-mono text-blue-600 cursor-pointer hover:underline truncate"
                                                    onClick={() => handleCopy(tx.txID, "TX Hash")}
                                                    title={tx.txID}
                                                  >
                                                      {tx.txID.slice(0, 10)}...
                                                  </div>
                                              </td>
                                              <td className="p-3 text-right w-24 align-top font-bold text-slate-700">
                                                  {tx.amount.toLocaleString()}
                                                  <span className="block text-[9px] text-slate-400 font-normal">{tx.token}</span>
                                              </td>
                                          </tr>
                                      )
                                  })
                              )}
                          </tbody>
                      </table>
                   </div>
                </div>
            </div>
        )}
      </div>
    </div>
    </>
  );
};