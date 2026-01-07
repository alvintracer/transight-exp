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
  private delayMs = 1000; // 딜레이를 1초로 약간 줄임

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
        await new Promise(r => setTimeout(r, this.delayMs));
      }
    }

    this.isProcessing = false;
  }
}

const tronScanQueue = new RequestQueue();

// ==========================================
// 2. 메인 스캐너 함수 (QuickNode History 제거됨)
// ==========================================
export const fetchAddressTransactions = async (
  address: string, 
  sinceTimestamp: number, 
  limit: number = 20
): Promise<CleanTx[]> => {
  if (!isValidAddress(address)) return [];

  const transactions: CleanTx[] = [];

  // [수정됨] QuickNode 호출 코드 삭제함.
  // 이유: QuickNode는 getTransactionsRelated 메서드(History)를 지원하지 않아 400 에러 발생.
  // 따라서 무조건 TronScan API(프록시)를 사용하도록 변경.

  // [STEP 1] TronScan API 사용 (TRX)
  try {
    const fetchTrx = async () => {
         // limit * 3으로 넉넉하게 요청
         const url = `${PROXY_BASE_URL}/transaction?sort=-timestamp&count=true&limit=${limit * 3}&start=0&address=${address}`;
         const res = await fetch(url);
         if (!res.ok) throw new Error(`TronScan Error: ${res.status}`);
         return await res.json();
    };

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

  // [STEP 2] TronScan API 사용 (USDT)
  try {
    const fetchUsdt = async () => {
        const trc20Url = `${PROXY_BASE_URL}/token_trc20/transfers?limit=${limit * 3}&start=0&sort=-timestamp&count=true&relatedAddress=${address}&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
        const res = await fetch(trc20Url);
        if (!res.ok) throw new Error(`TronScan Error: ${res.status}`);
        return await res.json();
    };

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
  
  return transactions.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
};


// ==========================================
// 3. 계정 상세 정보 (잔고는 QuickNode 사용 가능)
// ==========================================
export const fetchAccountDetail = async (address: string): Promise<AccountDetail | null> => {
  // 1순위: QuickNode RPC (잔고 조회는 매우 빠르고 정확함)
  try {
     // @ts-ignore
     const acc = await tronWeb.trx.getAccount(address);
     if (acc && Object.keys(acc).length > 0) {
        // USDT 찾기 (TRC20은 RPC로 바로 안나올 수 있어서 여기서는 TRX만 확실히 챙김)
        // 하지만 QuickNode도 getAccount에서 trc20 토큰 잔고를 완벽히 안 줄 수 있음.
        // 안전하게 TronScan API를 쓰는게 낫습니다.
     }
  } catch(e) {
     // RPC 실패시 패스
  }

  // 결론: 일관성을 위해 Account Detail도 TronScan API(Proxy)를 씁니다.
  try {
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

export const fetchRecentHistory = async (address: string): Promise<CleanTx[]> => {
    return fetchAddressTransactions(address, 0);
};