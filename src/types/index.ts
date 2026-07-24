export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
  GUEST = 'guest',
}

export enum CompanyType {
  TECH = 'tech',
  FINANCE = 'finance',
  HEALTHCARE = 'healthcare',
  OTHER = 'other',
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: number;
  ipAddress?: string;
  department?: string;
  role?: UserRole;
  channelRoles?: { [channelId: string]: 'admin' | 'member' };
  mutedChannels?: string[];
  companyType?: CompanyType;
  companyName?: string;
  publicKey?: string;
  lastRead?: { [channelId: string]: number };
  pinnedChannels?: string[];
  pinnedDMs?: string[];
  appFontFamily?: string;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: number;
  editedAt?: number;
  isLAN?: boolean;
  type: 'text' | 'file';
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  replyToId?: string;
  replyToSenderName?: string;
  replyToContent?: string;
  threadId?: string;
  replyCount?: number;
  reactions?: { [emoji: string]: string[] };
}

export interface WorkspaceFile {
  id: string;
  name: string;
  size: number;
  type: string;
  ownerId: string;
  ownerName: string;
  url: string;
  createdAt: number;
  updatedAt?: number;
  category: 'document' | 'image' | 'video' | 'archive' | 'other';
  versions?: FileVersion[];
  important?: boolean;
  companyName?: string;
}

export interface FileVersion {
  id: string;
  url: string;
  size: number;
  createdAt: number;
  ownerId: string;
  ownerName: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  icon?: string;
  members: string[];
  admins?: string[];
  mutedMembers?: string[];
  lastMessageTimestamp?: number;
  lastMessageSnippet?: string;
  lastMessageSenderId?: string;
  companyName?: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: number;
  endTime: number;
  organizerId: string;
  attendees: string[];
  platform?: string;
  createdAt: number;
  recurrence?: 'none' | 'daily' | 'weekly' | 'monthly';
  companyName?: string;
}

export interface AppUpdate {
  id: string;
  title: string;
  content: string;
  version: string;
  authorId: string;
  authorName: string;
  timestamp: number;
  status: 'published' | 'draft';
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  completed: boolean;
  notifyTime: number;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  notified?: boolean;
}
