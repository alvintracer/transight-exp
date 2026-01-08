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
// [New] API Key Rotation System
// ==========================================
// 1. 환경변수에서 콤마로 구분된 키들을 배열로 변환
const RAW_KEYS = import.meta.env.VITE_TRONSCAN_API_KEYS || '';
const API_KEYS = RAW_KEYS.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);

let currentKeyIndex = 0;

// 2. 키를 순서대로 하나씩 꺼내주는 함수 (Round Robin)
const getNextApiKey = (): string | null => {
  if (API_KEYS.length === 0) return null;
  const key = API_KEYS[currentKeyIndex];
  // 다음 인덱스로 이동 (끝에 다다르면 다시 0번으로)
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
};

// 로그로 키 개수 확인 (개발자 도구에서 확인용)
if (API_KEYS.length > 0) {
    console.log(`✅ ${API_KEYS.length} TronScan API Keys loaded for rotation.`);
} else {
    console.warn('⚠️ No TronScan API Keys found. Rate limits will be strict.');
}

// ==========================================
// Request Queue (Rate Limit 방지기)
// ==========================================
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;
  // 키가 많아졌으니 딜레이를 0.3초로 확 줄여서 속도를 높입니다! (기존 1초)
  private delayMs = 300; 

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
// Main Scanner Functions
// ==========================================
export const fetchAddressTransactions = async (
  address: string, 
  sinceTimestamp: number, 
  limit: number = 20
): Promise<CleanTx[]> => {
  if (!isValidAddress(address)) return [];

  const transactions: CleanTx[] = [];

  // [STEP 1] TRX History
  try {
    const fetchTrx = async () => {
         const url = `${PROXY_BASE_URL}/transaction?sort=-timestamp&count=true&limit=${limit * 3}&start=0&address=${address}`;
         
         // [핵심] 요청할 때마다 새 키를 가져옴
         const apiKey = getNextApiKey(); 
         
         const options = {
             method: 'GET',
             headers: {
                 'Content-Type': 'application/json',
                 ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {})
             }
         };

         const res = await fetch(url, options);
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

  // [STEP 2] USDT (TRC20) History
  try {
    const fetchUsdt = async () => {
        const trc20Url = `${PROXY_BASE_URL}/token_trc20/transfers?limit=${limit * 3}&start=0&sort=-timestamp&count=true&relatedAddress=${address}&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`;
        
        const apiKey = getNextApiKey(); // 키 교체

        const options = {
             method: 'GET',
             headers: {
                 'Content-Type': 'application/json',
                 ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {})
             }
         };

        const res = await fetch(trc20Url, options);
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

export const fetchAccountDetail = async (address: string): Promise<AccountDetail | null> => {
  try {
    const fetchDetail = async () => {
        const apiKey = getNextApiKey(); // 키 교체
        const options = {
             method: 'GET',
             headers: {
                 'Content-Type': 'application/json',
                 ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {})
             }
         };

        const response = await fetch(`${PROXY_BASE_URL}/account?address=${address}`, options);
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