import { tronWeb, isValidAddress } from '../lib/tronClient';

export interface CleanTx {
  txID: string;
  sender: string;
  receiver: string;
  amount: number;
  token: 'TRX' | 'USDT';
  timestamp: number;
}

export interface AccountDetail {
  address: string;
  balance_trx: number;
  balance_usdt: number;
  txCount: number;
}

const MIN_AMOUNT = 1.0;
const PROXY_BASE_URL = '/api/tronscan/api';

// ==========================================
// 1. API 요청 큐 (Rate Limit 방지기)
// ==========================================
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  private delayMs = 1500; // TronScan은 1.5초에 1번만 호출하도록 제한 (안전빵)

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
        // 다음 요청 전 강제 휴식
        await new Promise(r => setTimeout(r, this.delayMs));
      }
    }

    this.isProcessing = false;
  }
}

// 전역 큐 인스턴스 생성
const tronScanQueue = new RequestQueue();


// ==========================================
// 2. QuickNode RPC 시도 (TRX History)
// ==========================================
const fetchTrxViaQuickNode = async (address: string, limit: number): Promise<CleanTx[]> => {
  try {
    // QuickNode/TronWeb 표준 API로 과거 내역 시도
    // 주의: 노드 설정에 따라 빈 배열[]이 올 수 있음
    // @ts-ignore
    const txs = await tronWeb.trx.getTransactionsRelated(address, "all", limit);
    
    if (!txs || txs.length === 0) return [];

    console.log(`⚡ Fetched ${txs.length} TXs via QuickNode for ${address}`);

    return txs.map((tx: any) => {
        const raw = tx.raw_data.contract[0].parameter.value;
        return {
            txID: tx.txID,
            sender: tronWeb.address.fromHex(raw.owner_address),
            receiver: tronWeb.address.fromHex(raw.to_address),
            amount: (raw.amount || 0) / 1_000_000,
            token: 'TRX',
            timestamp: tx.raw_data.timestamp
        };
    }).filter((t: CleanTx) => t.amount >= MIN_AMOUNT);

  } catch (e) {
    // QuickNode가 지원 안 하면 조용히 실패하고 TronScan으로 넘어감
    return [];
  }
};


// ==========================================
// 3. 메인 스캐너 함수 (Hybrid)
// ==========================================
export const fetchAddressTransactions = async (
  address: string, 
  sinceTimestamp: number, 
  limit: number = 20
): Promise<CleanTx[]> => {
  if (!isValidAddress(address)) return [];

  const transactions: CleanTx[] = [];

  // [STEP 1] QuickNode RPC로 TRX 내역 조회 시도 (빠름)
  const quickNodeTxs = await fetchTrxViaQuickNode(address, limit);
  if (quickNodeTxs.length > 0) {
      // 성공하면 이거 씀 (필터링해서)
      quickNodeTxs.forEach(tx => {
          if (tx.timestamp >= sinceTimestamp) transactions.push(tx);
      });
  } else {
      // [STEP 2] 실패하면 TronScan API 사용 (느리지만 확실함, Queue 사용)
      try {
        const fetchTrx = async () => {
             const url = `${PROXY_BASE_URL}/transaction?sort=-timestamp&count=true&limit=${limit * 2}&start=0&address=${address}`;
             const res = await fetch(url);
             if (!res.ok) throw new Error(res.statusText);
             return await res.json();
        };

        // 큐에 넣어서 실행 (429 방지)
        const data = await tronScanQueue.add(fetchTrx);

        if (data?.data) {
            data.data.forEach((tx: any) => {
                if (tx.timestamp < sinceTimestamp) return;
                const amount = parseFloat(tx.amount) / 1_000_000;
                if (tx.contractType === 1 && amount >= MIN_AMOUNT) {
                    transactions.push({
                        txID: tx.hash,
                        sender: tx.ownerAddress,
                        receiver: tx.toAddress,
                        amount: amount,
                        token: 'TRX',
                        timestamp: tx.timestamp
                    });
                }
            });
        }
      } catch (e) {
        console.warn(`TronScan TRX failed for ${address}:`, e);
      }
  }

  // [STEP 3] USDT 조회 (RPC로는 조회가 매우 어려우므로 TronScan Queue 사용)
  try {
    const fetchUsdt = async () => {
        const trc20Url = `${PROXY_BASE_URL}/token_trc20/transfers?limit=${limit * 2}&start=0&sort=-timestamp&count=true&relatedAddress=${address}&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
        const res = await fetch(trc20Url);
        if (!res.ok) throw new Error(res.statusText);
        return await res.json();
    };

    // 큐에 넣어서 실행
    const trcData = await tronScanQueue.add(fetchUsdt);

    if (trcData?.token_transfers) {
        trcData.token_transfers.forEach((tx: any) => {
            if (tx.block_ts < sinceTimestamp) return;
            const amount = parseFloat(tx.quant) / 1_000_000;
            if (amount >= MIN_AMOUNT) {
                transactions.push({
                    txID: tx.transaction_id,
                    sender: tx.from_address,
                    receiver: tx.to_address,
                    amount: amount,
                    token: 'USDT',
                    timestamp: tx.block_ts
                });
            }
        });
    }
  } catch (e) {
      console.warn(`TronScan USDT failed for ${address}:`, e);
  }
  
  // 최신순 정렬
  return transactions.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
};


// ==========================================
// 4. 계정 상세 정보 (큐 적용)
// ==========================================
export const fetchAccountDetail = async (address: string): Promise<AccountDetail | null> => {
  try {
    // 이것도 429 날 수 있으므로 큐 사용
    const fetchDetail = async () => {
        const response = await fetch(`${PROXY_BASE_URL}/account?address=${address}`);
        if (!response.ok) throw new Error('Failed');
        return await response.json();
    };

    const data = await tronScanQueue.add(fetchDetail);
    
    const usdtToken = data.trc20token_balances?.find((t: any) => t.tokenId === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");

    return {
      address: data.address,
      balance_trx: (data.balance || 0) / 1_000_000,
      balance_usdt: usdtToken ? parseFloat(usdtToken.balance) / 1_000_000 : 0,
      txCount: data.totalTransactionCount || 0
    };
  } catch (e) {
    return null;
  }
};

// 단순 히스토리
export const fetchRecentHistory = async (address: string): Promise<CleanTx[]> => {
    return fetchAddressTransactions(address, 0);
};