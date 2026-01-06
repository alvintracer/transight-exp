import { create } from 'zustand';
import type { GraphData, GraphNode, GraphLink } from '../types/graph';
import { supabase } from '../lib/supabaseClient';

// [수정] customColor 속성 추가
export interface ExtendedNode extends GraphNode {
  createdAt: number;
  clusterId?: string;
  memo?: string;
  customColor?: string; // 이 부분이 없어서 에러가 났던 겁니다
}

export interface Cluster {
  id: string;
  name: string;
  color: string; // 클러스터 고유 색상
  nodeIds: string[];
}

// [수정] d3-force가 주입하는 속성들을 옵셔널(?)로 추가하여 에러 해결
export interface ExtendedNode extends GraphNode {
  createdAt: number;
  clusterId?: string;
  memo?: string;
  customColor?: string;
  isStart?: boolean;
  isTerminal?: boolean; // DB에 있어서 확장이 멈춘 노드 (이게 곧 '우리 DB에 있는 주소')
  
  // d3 Physics props
  x?: number;
  y?: number;
  fx?: number; // 고정된 x
  fy?: number; // 고정된 y
  vx?: number;
  vy?: number;
}

interface GlobalState {
  graphData: { nodes: ExtendedNode[], links: GraphLink[] };
  clusters: Cluster[];

  // [New] 인증 상태
  session: any | null;
  setSession: (session: any) => void;

  // [New] 저장/불러오기 액션
  saveSession: (title: string, mode: string) => Promise<boolean>;
  loadSession: (sessionId: string) => Promise<void>;

  selectedNode: ExtendedNode | null;
  selectedLink: GraphLink | null;

  setGraphData: (data: { nodes: ExtendedNode[], links: GraphLink[] }) => void;
  addNodes: (nodes: ExtendedNode[]) => void; // [New] Bulk Add
  addLinks: (links: any[]) => void; // 타입을 any로 넓혀서 txDetails 허용
  addNode: (node: ExtendedNode) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<ExtendedNode>) => void;
  
  createCluster: (name: string, nodeIds: string[]) => void;
  deleteCluster: (clusterId: string) => void;
  
  setSelectedNode: (node: ExtendedNode | null) => void;
  setSelectedLink: (link: GraphLink | null) => void;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  graphData: { nodes: [], links: [] },
  clusters: [],
  selectedNode: null,
  selectedLink: null,

  setGraphData: (data) => set({ graphData: data }),

  session: null,
  setSession: (session) => set({ session }),

  // [저장]
  saveSession: async (title, mode) => {
    const { session, graphData, clusters } = get();
    if (!session) return false;

    // ForceGraph 객체(순환 참조)를 순수 JSON으로 변환
    const cleanNodes = graphData.nodes.map(n => ({
      id: n.id,
      group: n.group,
      val: n.val,
      label: n.label,
      memo: n.memo,
      customColor: n.customColor,
      isStart: n.isStart,
      isTerminal: n.isTerminal,
      clusterId: n.clusterId,
      createdAt: n.createdAt,
      // 좌표 정보(x,y,fx,fy)를 꼭 저장해야 불러올 때 그 위치 그대로 복원됨
      x: n.x, y: n.y, fx: n.fx, fy: n.fy 
    }));

    const cleanLinks = graphData.links.map((l: any) => ({
      source: l.source.id || l.source, 
      target: l.target.id || l.target,
      value: l.value,
      txDetails: l.txDetails
    }));

    const saveData = { nodes: cleanNodes, links: cleanLinks, clusters };

    const { error } = await supabase
      .from('saved_sessions')
      .insert({ user_id: session.user.id, title, mode, graph_data: saveData });

    if (error) {
      console.error('Save Failed:', error);
      return false;
    }
    return true;
  },
// [불러오기]
  loadSession: async (sessionId) => {
    const { data, error } = await supabase
      .from('saved_sessions')
      .select('graph_data')
      .eq('id', sessionId)
      .single();

    if (error || !data) {
      console.error('Load Failed:', error);
      return;
    }

    const { nodes, links, clusters } = data.graph_data;
    
    // 상태 복원 (좌표 정보가 포함된 nodes가 들어감)
    set({
      graphData: { nodes, links },
      clusters: clusters || [],
      selectedNode: null,
      selectedLink: null
    });
  },
  
  addNode: (node) => set((state) => {
    if (state.graphData.nodes.find(n => n.id === node.id)) return state;
    return {
      graphData: {
        ...state.graphData,
        nodes: [...state.graphData.nodes, node]
      }
    };
  }),

// [수정 1] 노드 추가/업데이트 (기존 물리 좌표 보존)
  addNodes: (newNodes) => set((state) => {
    const nodeMap = new Map(state.graphData.nodes.map(n => [n.id, n]));
    
    newNodes.forEach(newNode => {
      const existingNode = nodeMap.get(newNode.id);
      if (existingNode) {
        // 기존 노드가 있으면 속성만 업데이트하고 객체 참조는 유지하려고 노력
        // (단, addNodes는 대량 추가라 교체 방식 사용하되 좌표 복사)
        nodeMap.set(newNode.id, {
          ...existingNode,
          ...newNode,
          x: existingNode.x,
          y: existingNode.y,
          fx: existingNode.fx,
          fy: existingNode.fy
        });
      } else {
        nodeMap.set(newNode.id, newNode);
      }
    });

    return {
      graphData: {
        ...state.graphData,
        nodes: Array.from(nodeMap.values())
      }
    };
  }),
  
// [핵심 수정] 노드 업데이트 (분리 현상 해결)
  updateNode: (nodeId, data) => set((state) => {
    const nodes = state.graphData.nodes;
    const nodeIndex = nodes.findIndex(n => n.id === nodeId);
    
    if (nodeIndex > -1) {
      // 1. 배열을 복사하여 React가 변경을 감지하게 함
      const newNodes = [...nodes];
      
      // 2. 그러나 객체 자체는 교체하지 않고 '기존 객체'를 수정(Mutation)함
      // 이렇게 해야 Links 배열이 참조하고 있는 메모리 주소가 유지됨
      const targetNode = newNodes[nodeIndex];
      Object.assign(targetNode, data);

      // 3. 변경된 배열로 업데이트
      return {
        graphData: {
          nodes: newNodes,
          links: state.graphData.links // 링크는 건드리지 않음 (참조 유지)
        },
        // 선택된 노드가 업데이트된 경우 UI 반영을 위해 갱신
        selectedNode: state.selectedNode?.id === nodeId ? { ...targetNode } : state.selectedNode
      };
    }
    return {};
  }),

  // 노드 삭제 (연결된 엣지도 같이 삭제해야 에러 안남)
  removeNode: (nodeId) => set((state) => ({
    graphData: {
      nodes: state.graphData.nodes.filter(n => n.id !== nodeId),
      links: state.graphData.links.filter(l => l.source !== nodeId && l.target !== nodeId) // @ts-ignore (id string check)
    },
    // 삭제된 노드가 선택 상태였다면 해제
    selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode
  })),

  // 클러스터 생성
  createCluster: (name, nodeIds) => set((state) => {
    const newClusterId = `cluster-${Date.now()}`;
    const randomColor = `hsl(${Math.random() * 360}, 70%, 50%)`; // 랜덤 색상 부여
    
    // 선택된 노드들의 속성 업데이트 (그룹 정보 추가)
    const updatedNodes = state.graphData.nodes.map(node => {
      if (nodeIds.includes(node.id)) {
        return { ...node, clusterId: newClusterId, group: 'cluster' as any }; // group 변경
      }
      return node;
    });

    return {
      clusters: [...state.clusters, { id: newClusterId, name, color: randomColor, nodeIds }],
      graphData: { ...state.graphData, nodes: updatedNodes }
    };
  }),

// [수정 2] 링크 추가
  addLinks: (newLinks) => set((state) => {
    const updatedLinks = [...state.graphData.links];
    newLinks.forEach(link => {
      const existingIdx = updatedLinks.findIndex(l => {
        const s = (typeof l.source === 'object') ? (l.source as any).id : l.source;
        const t = (typeof l.target === 'object') ? (l.target as any).id : l.target;
        return (s === link.source && t === link.target) || (s === link.target && t === link.source);
      });
      
      if (existingIdx > -1) {
        updatedLinks[existingIdx].value += link.value;
        // @ts-ignore
        if (link.txDetails) {
            // @ts-ignore
            if (!updatedLinks[existingIdx].txDetails) updatedLinks[existingIdx].txDetails = [];
            // @ts-ignore
            updatedLinks[existingIdx].txDetails.push(...link.txDetails);
        }
      } else {
        // @ts-ignore
        if (!link.txDetails) link.txDetails = [];
        updatedLinks.push(link);
      }
    });
    return { graphData: { ...state.graphData, links: updatedLinks } };
  }),

  deleteCluster: (clusterId) => set((state) => ({
    clusters: state.clusters.filter(c => c.id !== clusterId),
    // 클러스터 삭제 시 노드들은 다시 일반 타겟으로 복구
    graphData: {
      ...state.graphData,
      nodes: state.graphData.nodes.map(n => 
        n.clusterId === clusterId ? { ...n, clusterId: undefined, group: 'target' } : n
      )
    }
  })),

  setSelectedNode: (node) => set({ selectedNode: node, selectedLink: null }),
  setSelectedLink: (link) => set({ selectedLink: link, selectedNode: null }),
}));