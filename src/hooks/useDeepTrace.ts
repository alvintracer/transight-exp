import { useState, useCallback, useRef } from 'react'; // useRef 추가
import { useGlobalStore } from '../stores/useGlobalStore';
import { fetchAddressTransactions } from '../services/tronScanner';
import { checkAddressesRisk } from '../services/riskChecker';

type TraceProgress = {
    currentHop: number;
    maxHop: number;
    percentage: number;
};

export const useDeepTrace = () => {
  const { addNodes, addLinks, setGraphData } = useGlobalStore();
  const [isTracing, setIsTracing] = useState(false);
  const [traceLog, setTraceLog] = useState<string[]>([]);
  const [progress, setProgress] = useState<TraceProgress | null>(null);

  // [New] 중단 신호를 위한 Ref
  const abortRef = useRef(false);

  // [New] 중단 함수
  const stopDeepTrace = useCallback(() => {
    if (isTracing) {
        abortRef.current = true;
        setTraceLog(prev => [`🛑 Trace stopped by user.`, ...prev]);
        setIsTracing(false); // 즉시 상태 끄기
        setTimeout(() => setProgress(null), 1000);
    }
  }, [isTracing]);

  const startDeepTrace = useCallback(async (
    startAddress: string, 
    maxHops: number, 
    txLimit: number,
    mode: 'relation' | 'timeflow',
    startTime?: string
  ) => {
    // 시작 전 초기화
    abortRef.current = false; // 중단 플래그 초기화
    setIsTracing(true);
    setTraceLog([`🚀 Starting ${mode === 'timeflow' ? 'Time-Flow' : 'Relation'} Trace: ${startAddress}`]);
    
    setGraphData({ nodes: [], links: [] });

    const initialSince = (mode === 'timeflow' && startTime) ? new Date(startTime).getTime() : 0;

    const startNode = {
      id: startAddress,
      group: 'target',
      val: 20,
      isTerminal: false,
      createdAt: Date.now(),
      isStart: true
    };
    // @ts-ignore
    addNodes([startNode]);

    let currentLayer = new Map<string, number>();
    currentLayer.set(startAddress, initialSince);
    let visited = new Set<string>([startAddress]);

    for (let hop = 1; hop <= maxHops; hop++) {
      // [Check] 중단 신호 확인
      if (abortRef.current) break;

      if (currentLayer.size === 0) {
        setTraceLog(prev => [`✅ Trace finished early at Hop ${hop-1}`]);
        break;
      }

      setTraceLog(prev => [`🔍 Hop ${hop}/${maxHops}: Scanning ${currentLayer.size} nodes...`, ...prev]);
      
      const nextLayer = new Map<string, number>();
      const nodesToScan = Array.from(currentLayer.entries());
      const BATCH_SIZE = 5;
      
      for (let i = 0; i < nodesToScan.length; i += BATCH_SIZE) {
        // [Check] 중단 신호 확인 (배치 사이사이에도 체크)
        if (abortRef.current) break;

        const hopBase = (hop - 1) / maxHops;
        const layerProgress = (i / nodesToScan.length) / maxHops;
        const totalPercent = (hopBase + layerProgress) * 100;

        setProgress({
            currentHop: hop,
            maxHop: maxHops,
            percentage: Math.min(totalPercent, 99)
        });

        const batch = nodesToScan.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async ([nodeAddr, sinceTs]) => {
            // [Check] 비동기 안에서도 한번 더 체크 (선택사항이나 안전함)
            if (abortRef.current) return;

            const effectiveSince = mode === 'timeflow' ? sinceTs : 0;
            const txs = await fetchAddressTransactions(nodeAddr, effectiveSince, txLimit);
            
            if (txs.length === 0) return;

            const counterparties = new Set<string>();
            txs.forEach(tx => {
                const target = tx.sender === nodeAddr ? tx.receiver : tx.sender;
                counterparties.add(target);
            });
            const riskMap = await checkAddressesRisk(Array.from(counterparties));

            const newNodesToAdd: any[] = [];
            const newLinksToAdd: any[] = [];
            
            txs.forEach(tx => {
                const target = tx.sender === nodeAddr ? tx.receiver : tx.sender;
                
                newLinksToAdd.push({
                    source: tx.sender,
                    target: tx.receiver,
                    value: tx.amount,
                    txDetails: [tx]
                });

                if (!visited.has(target)) {
                    const riskInfo = riskMap.get(target);
                    const isTerminal = !!riskInfo;

                    newNodesToAdd.push({
                        id: target,
                        group: riskInfo ? (riskInfo.category as any) : 'target',
                        val: 10,
                        label: riskInfo?.label,
                        isTerminal: isTerminal,
                        createdAt: Date.now()
                    });

                    visited.add(target);
                    
                    if (!isTerminal) {
                        const existingNextTs = nextLayer.get(target);
                        if (!existingNextTs || tx.timestamp < existingNextTs) {
                            nextLayer.set(target, tx.timestamp);
                        }
                    }
                }
            });

            if (newNodesToAdd.length > 0) {
                // @ts-ignore
                addNodes(newNodesToAdd);
            }
            if (newLinksToAdd.length > 0) {
                addLinks(newLinksToAdd);
            }
        }));
        
        await new Promise(r => setTimeout(r, 300));
      }
      
      currentLayer = nextLayer;
    }

    if (!abortRef.current) {
        setProgress({ currentHop: maxHops, maxHop: maxHops, percentage: 100 });
        setTraceLog(prev => [`🎉 Analysis Complete!`, ...prev]);
        setIsTracing(false);
        setTimeout(() => setProgress(null), 3000);
    }

  }, [addNodes, addLinks, setGraphData]);

  // stopDeepTrace 반환 추가
  return { startDeepTrace, stopDeepTrace, isTracing, traceLog, progress };
};