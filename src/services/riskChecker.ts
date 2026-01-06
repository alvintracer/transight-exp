import { supabase } from '../lib/supabaseClient';

export interface RiskCheckResult {
  address: string;
  isRisk: boolean;
  label?: string;
  category?: string; // 특정 타입 강제하지 않고 string으로 풂
}

export const checkAddressesRisk = async (addresses: string[]): Promise<Map<string, RiskCheckResult>> => {
  if (addresses.length === 0) return new Map();

  const cleanAddresses = addresses.map(a => a.trim());

  // category나 label 내용 상관없이 주소가 일치하면 가져옴
  const { data, error } = await supabase
    .from('address_labels')
    .select('address, label_name, category')
    .in('address', cleanAddresses);

  if (error) {
    console.error('Supabase Error:', error);
    return new Map();
  }

  const resultMap = new Map<string, RiskCheckResult>();
  
  data?.forEach((row: any) => {
    // DB에 있다는 것 자체가 중요함. 
    // 카테고리가 없으면 'risk'로 강제해서 빨간색 띄우거나, 'detected'로 설정
    const category = row.category ? row.category.toLowerCase().trim() : 'risk';

    resultMap.set(row.address, {
      address: row.address,
      isRisk: true,
      label: row.label_name || 'Detected Address', // 라벨 없으면 기본 문구
      category: category
    });
  });

  return resultMap;
};