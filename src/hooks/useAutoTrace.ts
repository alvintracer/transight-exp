import { useEffect, useRef, useState } from 'react';
import { useGlobalStore } from '../stores/useGlobalStore';
import { fetchAddressTransactions } from '../services/tronScanner';
import { checkAddressesRisk } from '../services/riskChecker';

export const useAutoTrace = (isMonitoring: boolean) => {
  const { graphData, setGraphData } = useGlobalStore();
  const [logs, setLogs] = useState<string[]>([]);
  
  // UI 표시용 상태
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const processedTxIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isMonitoring) {
        setLastUpdated(null);
        return;
    }

    const runScan = async () => {
      setIsRefreshing(true); // 로딩 시작
      const activeNodes = graphData.nodes.filter(n => !n.isTerminal);
      
      if (activeNodes.length === 0) {
          setIsRefreshing(false);
          setLastUpdated(new Date().toLocaleTimeString());
          return;
      }

      // 429 에러 방지를 위해 노드별 순차 처리 (Promise.all 대신 for loop 사용 권장)
      for (const node of activeNodes) {
        // 노드 하나 처리하고 0.5초 쉬기 (API 보호)
        await new Promise(r => setTimeout(r, 500)); 

        const txs = await fetchAddressTransactions(node.id, node.createdAt);
        const newTxs = txs.filter(tx => !processedTxIds.current.has(tx.txID));
        
        if (newTxs.length === 0) continue;

        // ... (이하 로직 기존과 동일: 상대방 식별, 리스크 체크, 그래프 업데이트) ...
        const counterparties = new Set<string>();
        newTxs.forEach(tx => {
            const target = tx.sender === node.id ? tx.receiver : tx.sender;
            counterparties.add(target);
            processedTxIds.current.add(tx.txID);
        });

        const riskMap = await checkAddressesRisk(Array.from(counterparties));
        let updatedNodes = [...useGlobalStore.getState().graphData.nodes]; // 최신 상태 가져오기
        let updatedLinks = [...useGlobalStore.getState().graphData.links];
        let hasChanges = false;

        for (const tx of newTxs) {
             const targetAddr = tx.sender === node.id ? tx.receiver : tx.sender;
             const riskInfo = riskMap.get(targetAddr);
             
             // 노드 추가 로직
             const existingNode = updatedNodes.find(n => n.id === targetAddr);
             if (!existingNode) {
                 updatedNodes.push({
                     id: targetAddr,
                     group: riskInfo ? (riskInfo.category as any) : 'target',
                     val: 10,
                     label: riskInfo?.label,
                     isTerminal: !!riskInfo,
                     createdAt: Date.now()
                 });
                 if (riskInfo) setLogs(prev => [`⚠️ Hit: ${riskInfo.label}`, ...prev]);
                 else setLogs(prev => [`Expanded: ${targetAddr.slice(0,6)}...`, ...prev]);
                 hasChanges = true;
             }

             // 링크 추가 로직
             const linkIdx = updatedLinks.findIndex(l => 
                 (l.source === tx.sender && l.target === tx.receiver) ||
                 (l.source === tx.receiver && l.target === tx.sender)
             );
             if (linkIdx > -1) {
                 updatedLinks[linkIdx].value += tx.amount;
             } else {
                 updatedLinks.push({
                     source: tx.sender,
                     target: tx.receiver,
                     value: tx.amount
                 });
                 hasChanges = true;
             }
        }

        if (hasChanges) {
            setGraphData({ nodes: updatedNodes, links: updatedLinks });
        }
      } // end for loop

      setLastUpdated(new Date().toLocaleTimeString());
      setIsRefreshing(false); // 로딩 끝
    };

    // 30초(30000ms) 주기
    runScan();
    const interval = setInterval(runScan, 30000);
    return () => clearInterval(interval);
  }, [isMonitoring]); // graphData 의존성 제거 (getState로 내부에서 최신값 참조)

  return { logs, lastUpdated, isRefreshing };
};