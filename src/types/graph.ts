// src/types/graph.ts

// 반드시 앞에 'export'가 있어야 합니다!
export interface GraphNode {
  id: string;
  group: 'safe' | 'risk' | 'exchange' | 'target';
  val: number;
  label?: string;
  isTerminal?: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}