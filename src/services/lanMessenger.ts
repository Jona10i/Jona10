import { Message, User } from '../types';

/**
 * LAN Messenger Service
 * Uses BroadcastChannel to simulate local network communication in a browser context.
 * Enhanced with a discovery protocol:
 * - ANNOUNCE: Sent on startup/login
 * - QUERY: Sent to find existing peers immediately
 * - REPLY: Response to QUERY
 * - HEARTBEAT: Periodic keep-alive
 * - BYE: Graceful departure
 */

export interface PeerMetadata {
  userId: string;
  name: string;
  avatar?: string;
  lastSeen: number;
}

type DiscoveryAction = 'ANNOUNCE' | 'QUERY' | 'REPLY' | 'HEARTBEAT' | 'BYE';

interface DiscoveryMessage {
  type: DiscoveryAction;
  peer: PeerMetadata;
}

class LANMessenger {
  private channel: BroadcastChannel;
  private presenceChannel: BroadcastChannel;
  private listeners: ((msg: Message) => void)[] = [];
  private _peers: Map<string, PeerMetadata> = new Map();
  private _onPeerUpdate: ((peers: PeerMetadata[]) => void) | null = null;
  private currentUser: User | null = null;
  private heartbeatInterval: any = null;
  private _onTypingUpdate: ((data: { userId: string; userName: string; isTyping: boolean }) => void) | null = null;

  constructor() {
    this.channel = new BroadcastChannel('swift-drop-lan-messages');
    this.presenceChannel = new BroadcastChannel('swift-drop-lan-presence');

    this.channel.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'TYPING') {
        this._onTypingUpdate?.(data);
        return;
      }
      const msg: Message = data;
      this.listeners.forEach(l => l(msg));
    };

    this.presenceChannel.onmessage = (event) => {
      const data: DiscoveryMessage = event.data;
      this.handleDiscovery(data);
    };

    // Cleanup on window close
    window.addEventListener('beforeunload', () => {
      this.broadcast('BYE');
    });
  }

  setCurrentUser(user: User) {
    this.currentUser = user;
    this.broadcast('ANNOUNCE');
    this.broadcast('QUERY'); // Ask who else is here
    
    // Start heartbeats
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.broadcast('HEARTBEAT');
      this.pruneDeadPeers();
    }, 10000);
  }

  private handleDiscovery(msg: DiscoveryMessage) {
    if (!msg.peer || (this.currentUser && msg.peer.userId === this.currentUser.id)) return;

    switch (msg.type) {
      case 'ANNOUNCE':
      case 'HEARTBEAT':
      case 'REPLY':
        this.updatePeer(msg.peer);
        // If we see an ANNOUNCE or HEARTBEAT and we haven't replied to a QUERY, 
        // usually we just update. But if it was a QUERY, we MUST reply.
        break;
      case 'QUERY':
        this.broadcast('REPLY');
        break;
      case 'BYE':
        this.removePeer(msg.peer.userId);
        break;
    }
  }

  private updatePeer(metadata: PeerMetadata) {
    this._peers.set(metadata.userId, { ...metadata, lastSeen: Date.now() });
    this.notifyUpdate();
  }

  private removePeer(userId: string) {
    if (this._peers.delete(userId)) {
      this.notifyUpdate();
    }
  }

  private pruneDeadPeers() {
    const now = Date.now();
    let changed = false;
    this._peers.forEach((peer, id) => {
      if (now - peer.lastSeen > 30000) { // 30s timeout
        this._peers.delete(id);
        changed = true;
      }
    });
    if (changed) this.notifyUpdate();
  }

  private notifyUpdate() {
    this._onPeerUpdate?.(Array.from(this._peers.values()));
  }

  private broadcast(type: DiscoveryAction) {
    if (!this.currentUser) return;

    this.presenceChannel.postMessage({
      type,
      peer: {
        userId: this.currentUser.id,
        name: this.currentUser.name,
        avatar: this.currentUser.avatar,
        lastSeen: Date.now()
      }
    });
  }

  onMessage(callback: (msg: Message) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  sendMessage(msg: Message) {
    this.channel.postMessage({ ...msg, isLAN: true });
  }

  sendTyping(isTyping: boolean) {
    if (!this.currentUser) return;
    this.channel.postMessage({
      type: 'TYPING',
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      isTyping
    });
  }

  onTypingUpdate(callback: (data: { userId: string; userName: string; isTyping: boolean }) => void) {
    this._onTypingUpdate = callback;
    return () => {
      this._onTypingUpdate = null;
    }
  }

  onPeerUpdate(callback: (peers: PeerMetadata[]) => void) {
    this._onPeerUpdate = callback;
    callback(Array.from(this._peers.values())); // Initial call
    return () => {
       this._onPeerUpdate = null;
    }
  }

  get peers() {
    return Array.from(this._peers.values());
  }
}

export const lanMessenger = new LANMessenger();
