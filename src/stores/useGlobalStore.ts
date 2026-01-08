import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';
import type { GraphNode, GraphLink } from '../types/graph';

export interface ExtendedNode extends GraphNode {
  createdAt: number;
  clusterId?: string;
  memo?: string;
  customColor?: string;
  isStart?: boolean;
  isTerminal?: boolean;
  x?: number; y?: number; fx?: number; fy?: number; vx?: number; vy?: number;
}

export interface Cluster {
  id: string;
  name: string;
  color: string;
  nodeIds: string[];
}

interface GlobalState {
  graphData: { nodes: ExtendedNode[], links: GraphLink[] };
  clusters: Cluster[];
  session: any | null;
  selectedNode: ExtendedNode | null;
  selectedLink: GraphLink | null;
  
  // Layout & Physics
  layoutMode: 'physics' | 'horizontal';
  isPhysicsActive: boolean;
  
  // Selection
  selectedIds: Set<string>;
  
  // [New] Context Menu Integration
  pendingClusterNodes: string[]; // 우클릭으로 클러스터링 요청된 노드들

  // Actions
  setSession: (session: any) => void;
  setGraphData: (data: { nodes: ExtendedNode[], links: GraphLink[] }) => void;
  setSelectedNode: (node: ExtendedNode | null) => void;
  setSelectedLink: (link: GraphLink | null) => void;
  
  addNodes: (nodes: ExtendedNode[]) => void;
  addLinks: (links: any[]) => void;
  removeNode: (nodeId: string) => void;
  updateNode: (nodeId: string, updates: Partial<ExtendedNode>) => void;

  addCluster: (name: string, color: string, nodeIds: string[]) => void;
  removeCluster: (clusterId: string) => void;
  updateCluster: (clusterId: string, name: string, color: string, nodeIds: string[]) => void;

  setLayoutMode: (mode: 'physics' | 'horizontal') => void;
  setIsPhysicsActive: (isActive: boolean) => void;

  toggleSelectNode: (nodeId: string, multi?: boolean) => void;
  selectNodesByIds: (ids: string[]) => void;
  clearSelection: () => void;

  // [New] Actions
  setPendingClusterNodes: (ids: string[]) => void;
  clearPendingClusterNodes: () => void;

  saveSession: (title: string, mode: string) => Promise<boolean>;
  loadSession: (sessionId: string) => Promise<void>;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
  graphData: { nodes: [], links: [] },
  clusters: [],
  session: null,
  selectedNode: null,
  selectedLink: null,
  layoutMode: 'physics',
  isPhysicsActive: true,
  selectedIds: new Set(),
  pendingClusterNodes: [],

  setSession: (session) => set({ session }),
  setGraphData: (data) => set({ graphData: data }),
  setSelectedNode: (node) => set({ selectedNode: node, selectedLink: null }),
  setSelectedLink: (link) => set({ selectedLink: link, selectedNode: null }),

  addNodes: (newNodes) => set((state) => {
      const nodeMap = new Map(state.graphData.nodes.map(n => [n.id, n]));
      newNodes.forEach(newNode => {
        const existing = nodeMap.get(newNode.id);
        if (existing) nodeMap.set(newNode.id, { ...existing, ...newNode, x: existing.x, y: existing.y, fx: existing.fx, fy: existing.fy });
        else nodeMap.set(newNode.id, newNode);
      });
      return { graphData: { ...state.graphData, nodes: Array.from(nodeMap.values()) } };
  }),
  
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
                 if(!updatedLinks[existingIdx].txDetails) updatedLinks[existingIdx].txDetails = [];
                 // @ts-ignore
                 updatedLinks[existingIdx].txDetails.push(...link.txDetails);
            }
        }
        else { 
            // @ts-ignore
            if (!link.txDetails) link.txDetails = [];
            updatedLinks.push(link); 
        }
      });
      return { graphData: { ...state.graphData, links: updatedLinks } };
  }),

  removeNode: (nodeId) => set((state) => ({
      graphData: {
          nodes: state.graphData.nodes.filter(n => n.id !== nodeId),
          links: state.graphData.links.filter(l => (l.source as any).id !== nodeId && (l.target as any).id !== nodeId && l.source !== nodeId && l.target !== nodeId)
      },
      selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode
  })),

  updateNode: (nodeId, data) => set((state) => {
      const nodes = state.graphData.nodes;
      const idx = nodes.findIndex(n => n.id === nodeId);
      if (idx > -1) {
          const newNodes = [...nodes];
          Object.assign(newNodes[idx], data);
          return { 
              graphData: { nodes: newNodes, links: state.graphData.links },
              selectedNode: state.selectedNode?.id === nodeId ? { ...newNodes[idx] } : state.selectedNode
          };
      }
      return {};
  }),

  addCluster: (name, color, nodeIds) => set((state) => {
    const newClusterId = crypto.randomUUID();
    const newNodes = [...state.graphData.nodes];
    newNodes.forEach(node => {
        if (nodeIds.includes(node.id)) node.clusterId = newClusterId;
    });
    return {
        graphData: { ...state.graphData, nodes: newNodes },
        clusters: [...state.clusters, { id: newClusterId, name, color, nodeIds }]
    };
  }),

  removeCluster: (clusterId) => set((state) => {
    const newNodes = [...state.graphData.nodes];
    newNodes.forEach(node => {
        if (node.clusterId === clusterId) node.clusterId = undefined;
    });
    return {
        graphData: { ...state.graphData, nodes: newNodes },
        clusters: state.clusters.filter(c => c.id !== clusterId)
    };
  }),

  updateCluster: (clusterId, name, color, nodeIds) => set((state) => {
      const newNodes = [...state.graphData.nodes];
      newNodes.forEach(node => {
          if (node.clusterId === clusterId && !nodeIds.includes(node.id)) node.clusterId = undefined;
          if (nodeIds.includes(node.id)) node.clusterId = clusterId;
      });
      const updatedClusters = state.clusters.map(c => 
          c.id === clusterId ? { ...c, name, color, nodeIds } : c
      );
      return {
          graphData: { ...state.graphData, nodes: newNodes },
          clusters: updatedClusters
      };
  }),

  setLayoutMode: (mode) => set({ layoutMode: mode, isPhysicsActive: true }),
  setIsPhysicsActive: (isActive) => set({ isPhysicsActive: isActive }),

  toggleSelectNode: (nodeId, multi = false) => set((state) => {
    const newSet = multi ? new Set<string>(state.selectedIds) : new Set<string>();
    if (newSet.has(nodeId)) newSet.delete(nodeId);
    else newSet.add(nodeId);
    
    const selectedNode = newSet.size === 1 
        ? state.graphData.nodes.find(n => n.id === Array.from(newSet)[0]) || null 
        : (newSet.has(nodeId) ? state.graphData.nodes.find(n => n.id === nodeId) || null : state.selectedNode);

    return { selectedIds: newSet, selectedNode };
  }),

  selectNodesByIds: (ids) => set((state) => {
      const newSet = new Set<string>(state.selectedIds);
      ids.forEach(id => newSet.add(id));
      return { selectedIds: newSet };
  }),

  clearSelection: () => set({ selectedIds: new Set<string>(), selectedNode: null }),

  setPendingClusterNodes: (ids) => set({ pendingClusterNodes: ids }),
  clearPendingClusterNodes: () => set({ pendingClusterNodes: [] }),

  saveSession: async (title, mode) => {
      const { session, graphData, clusters, layoutMode } = get();
      if (!session) return false;
      const cleanNodes = graphData.nodes.map(n => ({
          id: n.id, group: n.group, val: n.val, label: n.label, memo: n.memo, customColor: n.customColor, isStart: n.isStart, isTerminal: n.isTerminal, clusterId: n.clusterId, createdAt: n.createdAt,
          x: n.x, y: n.y, fx: n.fx, fy: n.fy 
      }));
      const cleanLinks = graphData.links.map((l: any) => ({
          source: l.source.id || l.source, target: l.target.id || l.target, value: l.value, txDetails: l.txDetails
      }));
      const saveData = { nodes: cleanNodes, links: cleanLinks, clusters, layoutMode };
      const { error } = await supabase.from('saved_sessions').insert({ user_id: session.user.id, title, mode, graph_data: saveData });
      return !error;
  },
  loadSession: async (sessionId) => {
      const { data, error } = await supabase.from('saved_sessions').select('graph_data').eq('id', sessionId).single();
      if (error || !data) return;
      const { nodes, links, clusters, layoutMode } = data.graph_data;
      set({ 
          graphData: { nodes, links }, 
          clusters: clusters || [], 
          layoutMode: layoutMode || 'physics',
          isPhysicsActive: true,
          selectedNode: null, 
          selectedLink: null 
      });
  }
}));