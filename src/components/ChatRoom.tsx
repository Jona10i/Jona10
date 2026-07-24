import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  collection,
  addDoc,
  query,
  onSnapshot,
  orderBy,
  serverTimestamp,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  where,
  deleteDoc,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import {
  Send,
  Paperclip,
  File as FileIcon,
  X,
  Download,
  ImageIcon,
  FileText,
  Package,
  Users,
  Minimize2,
  AtSign,
  Edit2,
  Check,
  CornerDownRight,
  WifiOff,
  Zap,
  Shield,
  Search,
  Reply,
  UploadCloud,
  SmilePlus,
  MessageCircle,
  Trash2,
  VolumeX,
  UserMinus,
  UserPlus,
  Globe,
  Lock,
  ChevronRight,
  Hash,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Quote,
  Video,
} from "lucide-react";
import { db, auth, storage } from "../lib/firebase";
import { Message, User, UserRole, Channel } from "../types";
import { useFirebase } from "./FirebaseProvider";
import { lanMessenger, PeerMetadata } from "../services/lanMessenger";
import { cn, formatFileSize, formatDate as format } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { logActivity } from "../lib/audit";
import { useUserProfile } from "./UserProfileProvider";
import { ICONS, IconName } from "./Sidebar";

// Lazy-loaded so the react-markdown/remark stack stays out of the initial bundle.
// MarkdownRenderer.tsx holds the full implementation.
const MessageMarkdown = lazy(() => import("./MarkdownRenderer"));

interface ChatRoomProps {
  id: string;
  type: "channel" | "dm";
  name: string;
  onMinimize?: () => void;
}

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  id,
  type,
  name,
  onMinimize,
}) => {
  const { user, profile, isOnline, isAtLeast, accessToken, signIn } = useFirebase();
  const isAdmin = isAtLeast(UserRole.ADMIN);
  const { openProfile } = useUserProfile();
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [isCreatingMeet, setIsCreatingMeet] = useState(false);

  // LAN Mode State
  const [lanPeers, setLanPeers] = useState<PeerMetadata[]>([]);
  const [isSearchingPeers, setIsSearchingPeers] = useState(false);

  // Channel Metadata State
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);

  useEffect(() => {
    if (!id || type !== 'channel' || !isOnline) return;
    const unsub = onSnapshot(doc(db, 'channels', id), (docObj) => {
      if (docObj.exists()) {
        setCurrentChannel({ id: docObj.id, ...docObj.data() } as Channel);
      }
    });
    return () => unsub();
  }, [id, type, isOnline]);

  const channelAdmins = currentChannel?.admins || [];
  const channelMutedMembers = currentChannel?.mutedMembers || [];
  
  const isChannelAdmin = isAdmin || (user && channelAdmins.includes(user.uid));
  const isMuted = user && channelMutedMembers.includes(user.uid);

  // Edit State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // Mentions State
  const [workspaceUsers, setWorkspaceUsers] = useState<User[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Message | null>(null);

  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // Edit Channel State
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [editingChannelName, setEditingChannelName] = useState('');
  const [editingChannelDesc, setEditingChannelDesc] = useState('');
  const [editingChannelIcon, setEditingChannelIcon] = useState<string>('Hash');
  const [editingChannelIsPrivate, setEditingChannelIsPrivate] = useState(false);
  const [showChannelIconPicker, setShowChannelIconPicker] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);

  const handleUpdateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChannel || !id) return;
    
    setChannelError(null);
    const newName = editingChannelName.trim();
    
    // Validate newName
    const nameRegex = /^[a-z][a-z0-9_-]*$/;
    if (!nameRegex.test(newName) || newName.length < 3 || newName.length > 21) {
      setChannelError("Name must be 3-21 chars, lowercase alphanumeric, dashes, underscores");
      return;
    }

    try {
      setIsSavingChannel(true);
      await updateDoc(doc(db, 'channels', id), { 
        name: newName,
        description: editingChannelDesc,
        icon: editingChannelIcon,
        isPrivate: editingChannelIsPrivate
      });
      logActivity({
        type: 'channel',
        action: 'Channel Updated',
        details: `Updated channel: #${newName}`,
        severity: 'info'
      });
      setIsEditingChannel(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'channels');
    } finally {
      setIsSavingChannel(false);
    }
  };
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [threadInputValue, setThreadInputValue] = useState("");
  const [typingUsers, setTypingUsers] = useState<
    { userId: string; userName: string }[]
  >([]);

  const threadMessagesEndRef = useRef<HTMLDivElement>(null);

  const handleCreateMeetLink = async (target: 'main' | 'thread' = 'main') => {
    if (!user || isCreatingMeet) return;
    
    let currentToken = accessToken;
    if (!currentToken) {
      if (window.confirm('You need to authenticate with Google to access Meet. Sign in now?')) {
        try {
          await signIn();
          alert('Sign in complete. Please click the Meet button again.');
          return;
        } catch (e) {
          console.error(e);
          return;
        }
      } else {
        return;
      }
    }

    setIsCreatingMeet(true);
    try {
      const res = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${currentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error('Failed to create meeting space. Please ensure you have authenticated with the required Meet permissions.');
      }

      const data = await res.json();
      
      if (!data.meetingUri) {
         throw new Error('Did not receive a meeting URI');
      }

      if (target === 'main') {
        setInputValue(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + data.meetingUri + ' ');
      } else {
        setThreadInputValue(prev => prev + (prev.length > 0 && !prev.endsWith(' ') ? ' ' : '') + data.meetingUri + ' ');
      }
      
      await addDoc(collection(db, 'meetings'), {
        meetUri: data.meetingUri,
        name: `${profile?.name || 'User'}'s Meeting`,
        createdBy: user.uid,
        creatorName: profile?.name || 'Unknown',
        createdAt: Date.now()
      });

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to create meeting');
    } finally {
      setIsCreatingMeet(false);
    }
  };

  useEffect(() => {
    threadMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages]);

  const sendThreadMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!threadInputValue.trim() || !user || !profile || !activeThread) return;

    const messageData: Message = {
      id: Math.random().toString(36).substr(2, 9),
      channelId: id,
      senderId: user.uid,
      senderName: profile.name,
      senderAvatar: profile.avatar,
      content: threadInputValue,
      timestamp: Date.now(),
      type: "text",
      threadId: activeThread.id,
    };

    setThreadInputValue("");
    setShowMentions(false);

    if (!isOnline) {
      // LAN ONLY MODE
      const lanMessage = { ...messageData, isLAN: true };
      setThreadMessages((prev) => [...prev, lanMessage]);
      lanMessenger.sendMessage(lanMessage);

      logActivity({
        type: "channel",
        action: "LAN Thread Message Sent",
        details: `Sent thread message over local network in ${name}`,
        severity: "info",
      });
      return;
    }

    try {
      await addDoc(collection(db, "channels", id, "messages"), messageData);

      // Update thread replyCount
      await updateDoc(doc(db, "channels", id, "messages", activeThread.id), {
        replyCount: (activeThread.replyCount || 0) + 1,
      });

      await setDoc(
        doc(db, "channels", id),
        {
          lastMessageTimestamp: messageData.timestamp,
          lastMessageSnippet: `Replied in thread`,
          lastMessageSenderId: user.uid,
        },
        { merge: true },
      );

      await updateLastRead(messageData.timestamp);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "channels/messages");
    }
  };
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionTriggerIdx, setMentionTriggerIdx] = useState(-1);
  const [selectedMentionIdx, setSelectedMentionIdx] = useState(0);
  const [mentionTarget, setMentionTarget] = useState<"main" | "thread">("main");
  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [hasScrolledToUnread, setHasScrolledToUnread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const unreadMarkerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadInputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    // Real-time listener on users for mentions and read indicators
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setWorkspaceUsers(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as User),
        );
      },
      (error) => {
        console.warn("Failed to listen to users in real-time:", error);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!profile || !id) return;
    const ts = profile.lastRead?.[id] || 0;
    setLastReadTimestamp(ts);
    setHasScrolledToUnread(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const q = query(
      collection(db, "channels", id, "messages"),
      orderBy("timestamp", "desc"),
      limit(50),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as Message)
          .filter((msg) => !msg.threadId)
          .reverse();
        setMessages(msgs);

        // Update lastRead when new messages arrive and we are at the bottom
        // For simplicity, we update it as soon as we view the channel.
        if (msgs.length > 0) {
          const latestTs = msgs[msgs.length - 1].timestamp;
          if (latestTs > (profile?.lastRead?.[id] || 0)) {
            updateLastRead(latestTs);
          }
        }
      },
      (error) => {
        if (!isOnline) {
          console.warn("Firestore offline, using LAN fallback");
        } else {
          handleFirestoreError(
            error,
            OperationType.LIST,
            `channels/${id}/messages`,
          );
        }
      },
    );

    return () => unsubscribe();
  }, [id, isOnline]);

  // LAN Messenger Listeners
  useEffect(() => {
    if (!profile) return;
    lanMessenger.setCurrentUser(profile);

    if (isOnline) {
      setIsSearchingPeers(false);
      return;
    }

    setIsSearchingPeers(true);
    const unsubMessages = lanMessenger.onMessage((msg) => {
      if (msg.channelId === id) {
        if (msg.threadId) {
          if (activeThread?.id === msg.threadId) {
            setThreadMessages((prev) => {
              if (
                prev.find(
                  (m) =>
                    m.id === msg.id ||
                    (m.timestamp === msg.timestamp &&
                      m.senderId === msg.senderId),
                )
              )
                return prev;
              return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
            });
          } else {
            // If the thread is not active, we still need to potentially update the replyCount
            // of the parent message. We can find the parent message in messages state and increment.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.threadId
                  ? { ...m, replyCount: (m.replyCount || 0) + 1 }
                  : m,
              ),
            );
          }
        } else {
          setMessages((prev) => {
            if (
              prev.find(
                (m) =>
                  m.id === msg.id ||
                  (m.timestamp === msg.timestamp &&
                    m.senderId === msg.senderId),
              )
            )
              return prev;
            return [...prev, msg].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
      }
    });

    const unsubPeers = lanMessenger.onPeerUpdate((peers) => {
      setLanPeers(peers);
    });

    const unsubLanTyping = lanMessenger.onTypingUpdate((data) => {
      if (data.userId === user?.uid) return;
      setTypingUsers((prev) => {
        if (data.isTyping) {
          if (prev.find((u) => u.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, userName: data.userName }];
        } else {
          return prev.filter((u) => u.userId !== data.userId);
        }
      });
    });

    return () => {
      unsubMessages();
      unsubPeers();
      unsubLanTyping();
    };
  }, [id, isOnline, profile, user?.uid, activeThread?.id]);

  // Listen for typing users
  useEffect(() => {
    if (!id || !isOnline) {
      setTypingUsers([]);
      return;
    }

    const q = query(collection(db, "channels", id, "typing"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = Date.now();
        const users = snapshot.docs
          .map((doc) => doc.data())
          .filter(
            (data) =>
              data.isTyping &&
              data.userId !== user?.uid &&
              now - (data.updatedAt || 0) < 15000 &&
              (!activeThread
                ? !data.threadId
                : data.threadId === activeThread.id),
          )
          .map((data) => ({ userId: data.userId, userName: data.userName }));
        setTypingUsers(users);
      },
      (error) => console.warn("Typing indicator error", error),
    );

    return () => unsubscribe();
  }, [id, isOnline, user?.uid]);

  useEffect(() => {
    if (!activeThread || !isOnline) {
      setThreadMessages([]);
      return;
    }

    const q = query(
      collection(db, "channels", id, "messages"),
      where("threadId", "==", activeThread.id),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }) as Message)
          .sort((a, b) => a.timestamp - b.timestamp);
        setThreadMessages(msgs);
      },
      (error) => console.warn("Thread fetch error", error),
    );

    return () => unsubscribe();
  }, [activeThread?.id, id, isOnline]);

  const setTypingStatus = async (isTyping: boolean) => {
    if (!user || !profile || !id) return;

    if (!isOnline) {
      lanMessenger.sendTyping(isTyping);
      return;
    }

    const typingDocRef = doc(db, "channels", id, "typing", user.uid);
    try {
      await setDoc(
        typingDocRef,
        {
          channelId: id,
          threadId: activeThread?.id || "",
          userId: user.uid,
          userName: profile.name,
          isTyping: isTyping,
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn("typing error", err);
      // Ignore typing status errors to avoid noise
    }
  };

  const lastTypingTimeRef = useRef<number>(0);

  const handleTyping = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const now = Date.now();
    if (now - lastTypingTimeRef.current > 2000) {
      setTypingStatus(true);
      lastTypingTimeRef.current = now;
    }

    typingTimeoutRef.current = setTimeout(() => {
      setTypingStatus(false);
      lastTypingTimeRef.current = 0;
    }, 3000);
  };

  const updateLastRead = async (timestamp: number) => {
    if (!user || !id) return;
    try {
      await updateDoc(doc(db, "users", user.uid), {
        [`lastRead.${id}`]: timestamp,
      });
    } catch (error) {
      console.warn("Failed to update lastRead", error);
    }
  };

  const getReadUsersForMessage = (msg: Message, messageIdx: number) => {
    if (!workspaceUsers.length) return [];

    const activeId = id; // channel id or other user id
    const currentUserId = user?.uid;

    let teammates: User[] = [];
    if (type === "channel") {
      if (!currentChannel) return [];
      teammates = workspaceUsers.filter(
        (u) => u.id !== currentUserId && currentChannel.members.includes(u.id)
      );
    } else if (type === "dm") {
      teammates = workspaceUsers.filter((u) => u.id === activeId);
    }

    return teammates.filter((u) => {
      const lastReadKey = type === "dm" ? currentUserId : activeId;
      if (!lastReadKey) return false;

      const userLastRead = u.lastRead?.[lastReadKey] || 0;

      // The teammate has read at least up to this message
      const hasReadThis = userLastRead >= msg.timestamp;

      if (!hasReadThis) return false;

      // Check if they have read any subsequent message
      const isLatestRead = messages.slice(messageIdx + 1).every(
        (nextMsg) => userLastRead < nextMsg.timestamp
      );

      return isLatestRead;
    });
  };

  useEffect(() => {
    if (messages.length > 0 && !hasScrolledToUnread) {
      if (unreadMarkerRef.current) {
        unreadMarkerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      setHasScrolledToUnread(true);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const filteredUsers = workspaceUsers
    .filter(
      (u) =>
        (u.name || "").toLowerCase().includes((mentionQuery || "").toLowerCase()) ||
        (u.email || "").toLowerCase().includes((mentionQuery || "").toLowerCase()),
    )
    .slice(0, 5);

  const handleMentionChange = (
    value: string,
    cursorIdx: number,
    target: "main" | "thread",
  ) => {
    const textBeforeCursor = value.substring(0, cursorIdx);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");

    if (
      lastAtIdx !== -1 &&
      (lastAtIdx === 0 || textBeforeCursor[lastAtIdx - 1] === " ")
    ) {
      const queryText = textBeforeCursor.substring(lastAtIdx + 1);
      if (!queryText.includes(" ")) {
        setShowMentions(true);
        setMentionQuery(queryText);
        setMentionTriggerIdx(lastAtIdx);
        setSelectedMentionIdx(0);
        setMentionTarget(target);
        return;
      }
    }

    setShowMentions(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    
    handleTyping();
    handleMentionChange(value, e.target.selectionStart || 0, "main");
  };

  const handleThreadInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setThreadInputValue(value);
    
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    
    handleTyping();
    handleMentionChange(value, e.target.selectionStart || 0, "thread");
  };

  const insertMention = (u: User) => {
    if (mentionTarget === "main") {
      const before = inputValue.substring(0, mentionTriggerIdx);
      const after = inputValue.substring(inputRef.current?.selectionStart || 0);
      const newValue = `${before}@${u.name} ${after}`;
      setInputValue(newValue);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      const before = threadInputValue.substring(0, mentionTriggerIdx);
      const after = threadInputValue.substring(
        threadInputRef.current?.selectionStart || 0,
      );
      const newValue = `${before}@${u.name} ${after}`;
      setThreadInputValue(newValue);
      setTimeout(() => threadInputRef.current?.focus(), 0);
    }
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedMentionIdx((prev) => (prev + 1) % filteredUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedMentionIdx(
          (prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredUsers[selectedMentionIdx]) {
          insertMention(filteredUsers[selectedMentionIdx]);
        }
      } else if (e.key === "Escape") {
        setShowMentions(false);
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e as any);
      }
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !user || !profile) return;

    const messageData: Message = {
      id: Math.random().toString(36).substr(2, 9),
      channelId: id,
      senderId: user.uid,
      senderName: profile.name,
      senderAvatar: profile.avatar,
      content: inputValue,
      timestamp: Date.now(),
      type: "text",
      ...(replyingTo && {
        replyToId: replyingTo.id,
        replyToSenderName: replyingTo.senderName,
        replyToContent: replyingTo.content,
      }),
    };

    setInputValue("");
    setShowMentions(false);
    setReplyingTo(null);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    setTypingStatus(false);

    if (!isOnline) {
      // LAN ONLY MODE
      const lanMessage = { ...messageData, isLAN: true };
      setMessages((prev) => [...prev, lanMessage]);
      lanMessenger.sendMessage(lanMessage);

      logActivity({
        type: "channel",
        action: "LAN Message Sent",
        details: `Sent message over local network in ${name}`,
        severity: "info",
      });
      return;
    }

    try {
      await addDoc(collection(db, "channels", id, "messages"), messageData);

      // Update channel activity
      await setDoc(
        doc(db, "channels", id),
        {
          lastMessageTimestamp: messageData.timestamp,
          lastMessageSnippet:
            messageData.content.substring(0, 50) +
            (messageData.content.length > 50 ? "..." : ""),
          lastMessageSenderId: user.uid,
        },
        { merge: true },
      );

      // Update our own lastRead
      await updateLastRead(messageData.timestamp);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `channels/${id}/messages`,
      );
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setShowConfirmDialog(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setPendingFile(file);
      setShowConfirmDialog(true);
    }
  };

  const confirmUpload = async () => {
    if (!pendingFile || !user || !profile) return;

    const file = pendingFile;
    setPendingFile(null);
    setShowConfirmDialog(false);
    setIsUploading(true);
    setUploadProgress(0);

    if (!isOnline) {
      // Offline LAN File Signal
      const simulatedUrl = URL.createObjectURL(file);
      const fileMessage: Message = {
        id: Math.random().toString(36).substr(2, 9),
        channelId: id,
        senderId: user.uid,
        senderName: profile.name,
        senderAvatar: profile.avatar,
        content: `Sent a file: ${file.name}`,
        timestamp: Date.now(),
        type: "file",
        fileName: file.name,
        fileSize: file.size,
        fileUrl: simulatedUrl,
        isLAN: true,
        ...(replyingTo && {
          replyToId: replyingTo.id,
          replyToSenderName: replyingTo.senderName,
          replyToContent: replyingTo.content,
        }),
      };
      setMessages((prev) => [...prev, fileMessage]);
      lanMessenger.sendMessage(fileMessage);
      setReplyingTo(null);
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
      return;
    }

    // Real Firebase Storage Upload
    try {
      const storageRef = ref(
        storage,
        `workspaces/files/${Date.now()}_${file.name}`,
      );
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress =
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(Math.floor(progress));
        },
        (error) => {
          console.error("Upload failed:", error);
          setIsUploading(false);
          setUploadProgress(0);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);

          const fileMessage: Message = {
            id: Math.random().toString(36).substr(2, 9),
            channelId: id,
            senderId: user.uid,
            senderName: profile.name,
            senderAvatar: profile.avatar,
            content: `Sent a file: ${file.name}`,
            timestamp: Date.now(),
            type: "file",
            fileName: file.name,
            fileSize: file.size,
            fileUrl: downloadUrl,
            ...(replyingTo && {
              replyToId: replyingTo.id,
              replyToSenderName: replyingTo.senderName,
              replyToContent: replyingTo.content,
            }),
          };

          setReplyingTo(null);

          try {
            await addDoc(
              collection(db, "channels", id, "messages"),
              fileMessage,
            );

            // Update channel activity
            await setDoc(
              doc(db, "channels", id),
              {
                lastMessageTimestamp: fileMessage.timestamp,
                lastMessageSnippet: `Sent a file: ${file.name}`,
                lastMessageSenderId: user.uid,
              },
              { merge: true },
            );

            // Update our own lastRead
            await updateLastRead(fileMessage.timestamp);

            await addDoc(collection(db, "files"), {
              name: file.name,
              size: file.size,
              type: file.type,
              ownerId: user.uid,
              ownerName: profile.name,
              url: downloadUrl,
              createdAt: Date.now(),
              category: getCategory(file.type),
            });

            logActivity({
              type: "file",
              action: "File Upload",
              details: `Uploaded file: ${file.name} (${formatFileSize(file.size)}) to ${name}`,
              severity: "info",
            });
          } catch (dbError) {
            handleFirestoreError(
              dbError,
              OperationType.WRITE,
              "channels/files",
            );
          } finally {
            setUploadProgress(100);
            setTimeout(() => {
              setIsUploading(false);
              setUploadProgress(0);
            }, 500);
          }
        },
      );
    } catch (error) {
      console.error(error);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setShowConfirmDialog(false);
  };

  const startEditing = (msg: Message) => {
    setEditingMessageId(msg.id);
    setEditValue(msg.content);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditValue("");
  };

  const toggleReaction = async (
    messageId: string,
    emoji: string,
    currentReactions: { [emoji: string]: string[] } = {},
  ) => {
    if (!user) return;
    try {
      const reactions = { ...currentReactions };
      if (!reactions[emoji]) reactions[emoji] = [];

      if (reactions[emoji].includes(user.uid)) {
        reactions[emoji] = reactions[emoji].filter((uid) => uid !== user.uid);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji].push(user.uid);
      }

      await updateDoc(doc(db, "channels", id, "messages", messageId), {
        reactions,
      });
      setReactingMsgId(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `channels/${id}/messages/${messageId}`,
      );
    }
  };

  const startReply = (msg: Message) => {
    setReplyingTo(msg);
    inputRef.current?.focus();
    handleTyping();
  };

  const applyFormatting = (prefix: string, suffix: string, target: "main" | "thread") => {
    const input = target === "main" ? inputRef.current : threadInputRef.current;
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const currentVal = target === "main" ? inputValue : threadInputValue;

    const before = currentVal.substring(0, start);
    const selected = currentVal.substring(start, end);
    const after = currentVal.substring(end);

    const newVal = `${before}${prefix}${selected}${suffix}${after}`;
    
    if (target === "main") {
      setInputValue(newVal);
    } else {
      setThreadInputValue(newVal);
    }
    
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const saveEdit = async (messageId: string) => {
    if (!editValue.trim() || !user) return;

    try {
      await updateDoc(doc(db, "channels", id, "messages", messageId), {
        content: editValue,
        editedAt: Date.now(),
      });

      logActivity({
        type: "channel",
        action: "Message Edited",
        details: `Edited message in ${name}`,
        severity: "info",
      });

      cancelEditing();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `channels/${id}/messages/${messageId}`,
      );
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this message?"))
      return;

    try {
      await deleteDoc(doc(db, "channels", id, "messages", messageId));

      logActivity({
        type: "channel",
        action: "Message Deleted",
        details: `Deleted message in ${name}`,
        severity: "info",
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `channels/${id}/messages/${messageId}`,
      );
    }
  };

  const toggleMuteUser = async (userId: string) => {
    if (!currentChannel || !isChannelAdmin) return;
    const isCurrentlyMuted = channelMutedMembers.includes(userId);
    const newMuted = isCurrentlyMuted 
      ? channelMutedMembers.filter(id => id !== userId)
      : [...channelMutedMembers, userId];
      
    try {
      await updateDoc(doc(db, 'channels', id), {
        mutedMembers: newMuted
      });
    } catch (err) {
      console.error(err);
    }
  };

  const removeUserFromChannel = async (userId: string) => {
    if (!currentChannel || !isChannelAdmin) return;
    if (!window.confirm("Are you sure you want to remove this user from the channel?")) return;
    
    try {
      await updateDoc(doc(db, 'channels', id), {
        members: currentChannel.members.filter(mId => mId !== userId)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const addUserToChannel = async (userId: string) => {
    if (!currentChannel || !id) return;
    try {
      await updateDoc(doc(db, 'channels', id), {
        members: [...currentChannel.members, userId]
      });
      setMemberSearchQuery("");
    } catch (err) {
      console.error(err);
    }
  };

  const getCategory = (type: string): any => {
    if (type.startsWith("image/")) return "image";
    if (type.startsWith("video/")) return "video";
    if (type.includes("zip") || type.includes("tar")) return "archive";
    if (type.includes("pdf") || type.includes("doc") || type.includes("text"))
      return "document";
    return "other";
  };

  const getFileIcon = (fileName?: string) => {
    const ext = (fileName || "").split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif"].includes(ext!))
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    if (["pdf", "doc", "docx", "txt"].includes(ext!))
      return <FileText className="w-5 h-5 text-blue-500" />;
    if (["zip", "rar", "7z"].includes(ext!))
      return <Package className="w-5 h-5 text-orange-500" />;
    return <FileIcon className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="h-full w-full flex overflow-hidden">
      <div
        className={cn(
          "flex-1 flex flex-col bg-workspace-bg h-full relative transition-all duration-300",
          activeThread ? "min-w-[400px] border-r border-slate-100" : "",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        <AnimatePresence>
          {isDragging && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-workspace-accent/10 backdrop-blur-[2px] flex items-center justify-center border-4 border-dashed border-workspace-accent/50 rounded-lg m-2 p-4"
            >
              <div className="bg-white px-6 py-6 sm:px-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 text-center max-w-sm w-full">
                <div className="w-16 h-16 bg-workspace-accent/10 rounded-full flex items-center justify-center">
                  <UploadCloud className="w-8 h-8 text-workspace-accent" />
                </div>
                <p className="text-xl font-bold text-slate-800">
                  Drop file to upload
                </p>
                <p className="text-sm text-slate-500">
                  File will be sent to {name}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div 
              className={cn(
                "w-10 h-10 bg-slate-50 flex items-center justify-center rounded-xl border border-slate-100 font-serif transition-colors",
                isChannelAdmin && type === "channel" ? "cursor-pointer hover:bg-slate-200 hover:border-slate-300" : ""
              )}
              onClick={() => {
                if (isChannelAdmin && type === "channel" && currentChannel) {
                  setEditingChannelName(currentChannel.name);
                  setEditingChannelDesc(currentChannel.description || '');
                  setEditingChannelIcon(currentChannel.icon || 'Hash');
                  setEditingChannelIsPrivate(currentChannel.isPrivate || false);
                  setIsEditingChannel(true);
                }
              }}
              title={isChannelAdmin && type === "channel" ? "Edit channel icon" : undefined}
            >
              {type === "channel" ? React.createElement(currentChannel?.icon ? ICONS[(currentChannel.icon as IconName)] : (ICONS.Hash as any), { className: "w-5 h-5 text-slate-500" }) : (name || "").charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 group/header">
                <h2 
                  className={cn(
                    "font-bold text-slate-900 leading-tight flex items-center gap-2 transition-colors",
                    isChannelAdmin && type === "channel" ? "cursor-pointer hover:text-workspace-accent" : ""
                  )}
                  onClick={() => {
                    if (isChannelAdmin && type === "channel" && currentChannel) {
                      setEditingChannelName(currentChannel.name);
                      setEditingChannelDesc(currentChannel.description || '');
                      setEditingChannelIcon(currentChannel.icon || 'Hash');
                      setEditingChannelIsPrivate(currentChannel.isPrivate || false);
                      setIsEditingChannel(true);
                    }
                  }}
                  title={isChannelAdmin && type === "channel" ? "Edit channel details" : undefined}
                >
                  {name}
                  {isChannelAdmin && type === "channel" && <Edit2 className="w-3.5 h-3.5 opacity-0 group-hover/header:opacity-100 transition-opacity text-slate-400" />}
                </h2>
                {!isOnline && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-tighter rounded-full border border-amber-100">
                    <WifiOff className="w-3 h-3" />
                    LAN MODE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                  {type === "channel"
                    ? "Public Channel"
                    : "Direct Workspace Link"}
                </p>
                <AnimatePresence>
                  {typingUsers.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -5 }}
                      className="flex items-center gap-1.5"
                    >
                      <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_0ms]" />
                      <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_200ms]" />
                      <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_400ms]" />
                      <span className="text-[9px] font-bold text-workspace-accent italic">
                        {typingUsers.length === 1
                          ? `${typingUsers[0].userName} is typing...`
                          : typingUsers.length === 2
                            ? `${typingUsers[0].userName} & ${typingUsers[1].userName} are typing...`
                            : `${typingUsers[0].userName} & ${typingUsers.length - 1} others typing...`}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {type === 'channel' && currentChannel && (
              <button
                onClick={() => setShowMembersModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-slate-100 rounded-lg text-slate-500 font-bold text-sm transition-colors"
                title="View Members"
              >
                <Users className="w-4 h-4" />
                <span>{currentChannel.members.length}</span>
              </button>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-workspace-accent focus:border-workspace-accent transition-all w-64"
              />
            </div>
            {onMinimize && (
              <button
                onClick={onMinimize}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Minimize to Bubble"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <AnimatePresence>
            {!isOnline && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-amber-700">
                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                      <Zap
                        className={cn(
                          "w-5 h-5",
                          isSearchingPeers ? "animate-pulse" : "",
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-bold">
                        Zeroconf LAN Discovery Active
                      </p>
                      <p className="text-[10px] opacity-70">
                        Internet disconnected. Using local network fail-safe.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {lanPeers.slice(0, 3).map((peer) => (
                          <div
                            key={peer.userId}
                            className="w-6 h-6 rounded-full border-2 border-white bg-slate-100 overflow-hidden shadow-sm"
                            title={peer.name}
                          >
                            {peer.avatar ? (
                              <img src={peer.avatar} alt={peer.name} />
                            ) : (
                              <Users className="w-3 h-3 m-1.5 text-slate-300" />
                            )}
                          </div>
                        ))}
                        {lanPeers.length > 3 && (
                          <div className="w-6 h-6 rounded-full border-2 border-white bg-amber-100 flex items-center justify-center text-[8px] font-bold text-amber-700 shadow-sm">
                            +{lanPeers.length - 3}
                          </div>
                        )}
                      </div>
                      <div className="bg-amber-100/50 px-2 py-1 rounded-lg">
                        <span className="text-[10px] font-bold">
                          {lanPeers.length} Peers
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono opacity-50 italic">
                      Zeroconf Active
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-50 max-w-xs mx-auto">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Download className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-600">
                {t("empty.messages")}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {t("empty.messagesSubtitle")}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (
              searchQuery &&
              !(msg.content || "").toLowerCase().includes((searchQuery || "").toLowerCase())
            )
              return null;
            const isMe = msg.senderId === user?.uid;
            const showTime =
              idx === 0 ||
              messages[idx - 1].senderId !== msg.senderId ||
              msg.timestamp - messages[idx - 1].timestamp > 300000;
            const isFirstUnread =
              lastReadTimestamp > 0 &&
              msg.timestamp > lastReadTimestamp &&
              (idx === 0 || messages[idx - 1].timestamp <= lastReadTimestamp) &&
              !isMe;
            const isEditing = editingMessageId === msg.id;
            const canEdit =
              isMe &&
              msg.type === "text" &&
              Date.now() - msg.timestamp < 300000; // 5 minute limit
            const canDelete = isMe || isChannelAdmin;

            return (
              <React.Fragment key={msg.id}>
                {isFirstUnread && (
                  <div
                    ref={unreadMarkerRef}
                    className="flex items-center gap-4 py-4"
                  >
                    <div className="flex-1 h-[1px] bg-red-500/20" />
                    <div className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-[10px] font-black uppercase tracking-[0.2em] text-red-500 rounded-full border border-red-100 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      New Messages
                    </div>
                    <div className="flex-1 h-[1px] bg-red-500/20" />
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex items-start gap-4 group/msg",
                    isMe && "flex-row-reverse",
                  )}
                >
                  <button
                    onClick={() => openProfile(msg.senderId)}
                    className={cn(
                      "w-10 h-10 rounded-full flex-shrink-0 overflow-hidden shadow-sm cursor-pointer hover:ring-2 ring-workspace-accent transition-all",
                      showTime
                        ? "bg-slate-100 border border-slate-200"
                        : "opacity-0 cursor-default pointer-events-none",
                    )}
                  >
                    {showTime &&
                      (msg.senderAvatar ? (
                        <img src={msg.senderAvatar} alt="" />
                      ) : (
                        <Users className="w-5 h-5 m-2.5 text-slate-300" />
                      ))}
                  </button>
                  <div
                    className={cn(
                      "flex flex-col max-w-[75%] relative",
                      isMe && "items-end",
                    )}
                  >
                    {showTime && (
                      <div
                        className={cn(
                          "flex items-center gap-2 mb-1.5",
                          isMe && "flex-row-reverse",
                        )}
                      >
                        <button
                          onClick={() => openProfile(msg.senderId)}
                          className="text-[13px] font-bold text-slate-900 cursor-pointer hover:underline"
                        >
                          {msg.senderName}
                        </button>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {format(msg.timestamp, "HH:mm")}
                        </span>
                        {msg.editedAt && (
                          <span className="text-[10px] text-slate-300 italic">
                            ({t("files.edited")})
                          </span>
                        )}
                      </div>
                    )}

                    {msg.type === "text" ? (
                      <div className="group/bubble relative">
                        {msg.replyToId && (
                          <div
                            className={cn(
                              "mb-1 flex items-start gap-2 max-w-full opacity-60 hover:opacity-100 transition-opacity cursor-pointer",
                              isMe ? "flex-row-reverse" : "flex-row",
                            )}
                          >
                            <div className="w-0.5 self-stretch bg-slate-200" />
                            <div className="text-left overflow-hidden">
                              <p className="text-[10px] font-bold text-slate-500 truncate">
                                {msg.replyToSenderName}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate leading-tight">
                                {msg.replyToContent}
                              </p>
                            </div>
                          </div>
                        )}
                        {isEditing ? (
                          <div className="flex flex-col gap-2 bg-white p-2 rounded-2xl border border-workspace-accent shadow-lg min-w-[200px]">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(msg.id);
                                if (e.key === "Escape") cancelEditing();
                              }}
                              className="w-full bg-slate-50 border-none rounded-xl p-2 text-sm focus:ring-0 text-slate-700"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-2 px-1 pb-1">
                              <button
                                onClick={cancelEditing}
                                className="p-1 px-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
                              >
                                {t("common.cancel")}
                              </button>
                              <button
                                onClick={() => saveEdit(msg.id)}
                                className="flex items-center gap-1.5 p-1 px-3 bg-workspace-accent text-white rounded-lg text-[10px] font-bold shadow-sm hover:scale-105 active:scale-95 transition-all"
                              >
                                <Check className="w-3 h-3" />
                                {t("files.save")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className={cn(
                                "px-4 py-2.5 rounded-2xl text-[15px] shadow-sm whitespace-normal transition-all flex flex-col min-w-[80px]",
                                isMe
                                  ? "bg-workspace-accent text-white rounded-tr-sm"
                                  : "bg-white text-slate-800 rounded-tl-sm border border-slate-200",
                              )}
                            >
                              <Suspense
                                fallback={
                                  <div className="markdown-body text-inherit leading-relaxed whitespace-pre-wrap break-words">
                                    {msg.content}
                                  </div>
                                }
                              >
                                <MessageMarkdown
                                  content={msg.content}
                                  isMe={isMe}
                                />
                              </Suspense>
                              {msg.isLAN && (
                                <div
                                  className={cn(
                                    "text-[9px] mt-1.5 opacity-60 font-mono flex items-center gap-1",
                                    isMe ? "text-blue-50" : "text-slate-400",
                                  )}
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>LAN</span>
                                </div>
                              )}
                            </div>
                            <div
                              className={cn(
                                "absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-all flex items-center gap-1 z-20",
                                isMe
                                  ? "right-[calc(100%+8px)]"
                                  : "left-[calc(100%+8px)]",
                              )}
                            >
                              <button
                                onMouseLeave={() => setReactingMsgId(null)}
                                onClick={() =>
                                  setReactingMsgId(
                                    reactingMsgId === msg.id ? null : msg.id,
                                  )
                                }
                                className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all relative"
                                title="React"
                              >
                                <SmilePlus className="w-3.5 h-3.5" />
                                <AnimatePresence>
                                  {reactingMsgId === msg.id && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                      animate={{ opacity: 1, scale: 1, y: 0 }}
                                      exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                      className={cn(
                                        "absolute top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl flex items-center gap-1 p-1 z-50",
                                        isMe ? "right-0" : "left-0",
                                      )}
                                    >
                                      {["👍", "❤️", "😂", "🎉", "👀"].map(
                                        (emoji) => (
                                          <div
                                            key={emoji}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleReaction(
                                                msg.id,
                                                emoji,
                                                msg.reactions,
                                              );
                                            }}
                                            className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-base leading-none transition-transform hover:scale-110"
                                          >
                                            {emoji}
                                          </div>
                                        ),
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </button>
                              <button
                                onClick={() => startReply(msg)}
                                className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all"
                                title="Reply inline"
                              >
                                <Reply className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setActiveThread(msg)}
                                className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all"
                                title="Reply in thread"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              {canEdit && (
                                <button
                                  onClick={() => startEditing(msg)}
                                  className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all"
                                  title={t("files.editMessage")}
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  onClick={() => deleteMessage(msg.id)}
                                  className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-500 shadow-sm transition-all"
                                  title={t("common.delete")}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                        {msg.reactions &&
                          Object.keys(msg.reactions).length > 0 && (
                            <div
                              className={cn(
                                "flex flex-wrap gap-1 mt-1",
                                isMe && "justify-end",
                              )}
                            >
                              {Object.entries(
                                msg.reactions as Record<string, string[]>,
                              ).map(([emoji, uids]) => {
                                const hasReacted = uids.includes(
                                  user?.uid || "",
                                );
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() =>
                                      toggleReaction(
                                        msg.id,
                                        emoji,
                                        msg.reactions,
                                      )
                                    }
                                    className={cn(
                                      "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-all",
                                      hasReacted
                                        ? "bg-workspace-accent/10 border-workspace-accent/30 text-workspace-accent"
                                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 relative z-10",
                                    )}
                                  >
                                    <span>{emoji}</span>
                                    <span className="opacity-80 leading-none">
                                      {uids.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        {msg.replyCount !== undefined && msg.replyCount > 0 && (
                          <button
                            onClick={() => setActiveThread(msg)}
                            className={cn(
                              "flex items-center gap-1.5 mt-1 text-[11px] font-bold text-workspace-accent hover:underline w-fit",
                              isMe && "self-end",
                            )}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>
                              {msg.replyCount}{" "}
                              {msg.replyCount === 1 ? "reply" : "replies"}
                            </span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="group/bubble relative">
                        <div
                          className={cn(
                            "p-4 rounded-2xl border flex flex-col gap-3 max-w-sm relative",
                            isMe
                              ? "bg-white border-blue-100 rounded-tr-none"
                              : "bg-white border-slate-100 rounded-tl-none",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-100">
                              {getFileIcon(msg.fileName || "")}
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {msg.fileName}
                              </p>
                              <p className="text-[10px] font-mono text-slate-400">
                                {formatFileSize(msg.fileSize || 0)}
                              </p>
                            </div>
                            <a
                              href={msg.fileUrl}
                              download={msg.fileName}
                              className="p-2 hover:bg-slate-50 rounded-lg transition-colors text-slate-400 hover:text-workspace-accent relative z-10"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                          {msg.replyToId && (
                            <div
                              className="bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl mb-2 hover:bg-slate-100 transition-colors cursor-pointer"
                              onClick={() => {}}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Reply className="w-3 h-3 text-slate-400" />
                                <span className="text-[11px] font-bold text-slate-600">
                                  {msg.replyToSenderName}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">
                                {msg.replyToContent}
                              </p>
                            </div>
                          )}
                          <div className="flex justify-end border-t border-slate-50 pt-2">
                            <span className="text-[9px] font-mono text-slate-400 opacity-60">
                              {format(msg.timestamp, "HH:mm")}
                            </span>
                          </div>
                        </div>

                        <div
                          className={cn(
                            "absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-all flex items-center gap-1 z-20",
                            isMe
                              ? "right-[calc(100%+8px)]"
                              : "left-[calc(100%+8px)]",
                          )}
                        >
                          <button
                            onMouseLeave={() => setReactingMsgId(null)}
                            onClick={() =>
                              setReactingMsgId(
                                reactingMsgId === msg.id ? null : msg.id,
                              )
                            }
                            className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all relative z-30"
                            title="React"
                          >
                            <SmilePlus className="w-3.5 h-3.5" />
                            <AnimatePresence>
                              {reactingMsgId === msg.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                  className={cn(
                                    "absolute top-full mt-1 bg-white border border-slate-100 rounded-xl shadow-xl flex items-center gap-1 p-1 z-50",
                                    isMe ? "right-0" : "left-0",
                                  )}
                                >
                                  {["👍", "❤️", "😂", "🎉", "👀"].map(
                                    (emoji) => (
                                      <div
                                        key={emoji}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleReaction(
                                            msg.id,
                                            emoji,
                                            msg.reactions,
                                          );
                                        }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg cursor-pointer text-base leading-none transition-transform hover:scale-110"
                                      >
                                        {emoji}
                                      </div>
                                    ),
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </button>
                          <button
                            onClick={() => startReply(msg)}
                            className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all z-30"
                            title="Reply inline"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setActiveThread(msg)}
                            className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-workspace-accent hover:border-workspace-accent shadow-sm transition-all z-30"
                            title="Reply in thread"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => deleteMessage(msg.id)}
                              className="p-1.5 bg-white border border-slate-100 rounded-lg text-slate-400 hover:text-red-500 hover:border-red-500 shadow-sm transition-all z-30"
                              title={t("common.delete")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {msg.reactions &&
                          Object.keys(msg.reactions).length > 0 && (
                            <div
                              className={cn(
                                "flex flex-wrap gap-1 mt-1",
                                isMe && "justify-end",
                              )}
                            >
                              {Object.entries(
                                msg.reactions as Record<string, string[]>,
                              ).map(([emoji, uids]) => {
                                const hasReacted = uids.includes(
                                  user?.uid || "",
                                );
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() =>
                                      toggleReaction(
                                        msg.id,
                                        emoji,
                                        msg.reactions,
                                      )
                                    }
                                    className={cn(
                                      "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border transition-all relative z-10",
                                      hasReacted
                                        ? "bg-workspace-accent/10 border-workspace-accent/30 text-workspace-accent"
                                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50",
                                    )}
                                  >
                                    <span>{emoji}</span>
                                    <span className="opacity-80 leading-none">
                                      {uids.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        {msg.replyCount !== undefined && msg.replyCount > 0 && (
                          <button
                            onClick={() => setActiveThread(msg)}
                            className={cn(
                              "flex items-center gap-1.5 mt-1 text-[11px] font-bold text-workspace-accent hover:underline w-fit",
                              isMe && "self-end",
                            )}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>
                              {msg.replyCount}{" "}
                              {msg.replyCount === 1 ? "reply" : "replies"}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Read Indicators */}
                    {(() => {
                      const readUsers = getReadUsersForMessage(msg, idx);
                      if (readUsers.length === 0) return null;
                      return (
                        <div
                          className={cn(
                            "flex items-center gap-1.5 mt-1.5 select-none",
                            isMe ? "justify-end" : "justify-start"
                          )}
                        >
                          <div className="flex -space-x-1 overflow-hidden p-0.5">
                            {readUsers.map((u) => (
                              <div
                                key={u.id}
                                className="w-4 h-4 rounded-full bg-slate-100 ring-2 ring-white overflow-hidden shadow-sm flex items-center justify-center shrink-0 group/read relative"
                                title={`Seen by ${u.name}`}
                              >
                                {u.avatar ? (
                                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full bg-workspace-accent text-[8px] font-bold text-white flex items-center justify-center">
                                    {(u.name || "").charAt(0)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {readUsers.length === 1 && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Seen by {readUsers[0].name}
                            </span>
                          )}
                          {readUsers.length > 1 && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Seen by {readUsers.length} teammates
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              </React.Fragment>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Mention Dropdown */}
        <AnimatePresence>
          {showMentions && filteredUsers.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "absolute z-[70] w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden py-2",
                mentionTarget === "main"
                  ? "bottom-24 left-10"
                  : "bottom-20 right-10",
              )}
            >
              <div className="px-4 py-2 border-b border-slate-50 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <AtSign className="w-3 h-3" />
                <span>Mention User</span>
              </div>
              {filteredUsers.map((u, i) => (
                <button
                  key={u.id}
                  onClick={() => insertMention(u)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                    i === selectedMentionIdx
                      ? "bg-workspace-accent/5 text-workspace-accent font-bold"
                      : "hover:bg-slate-50 text-slate-700",
                  )}
                >
                  <div className="w-6 h-6 rounded-lg bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" />
                    ) : (
                      <Users className="w-3 h-3 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs truncate">{u.name}</p>
                    <p className="text-[9px] text-slate-400 truncate tracking-tight">
                      {u.email}
                    </p>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="p-6 bg-white border-t border-slate-50">
          <AnimatePresence>
            {replyingTo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3 px-4 py-3 bg-slate-50 rounded-2xl border-l-4 border-workspace-accent flex items-center justify-between"
              >
                <div className="overflow-hidden">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Reply className="w-3 h-3 text-workspace-accent" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Replying to {replyingTo.senderName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate italic">
                    "{replyingTo.content}"
                  </p>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <form
            onSubmit={sendMessage}
            className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm focus-within:ring-4 focus-within:ring-workspace-accent/10 focus-within:border-workspace-accent transition-all duration-200"
          >
            {!isMuted && (
              <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-slate-50">
                <button type="button" onClick={() => applyFormatting('**', '**', 'main')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Bold"><Bold className="w-4 h-4" /></button>
                <button type="button" onClick={() => applyFormatting('*', '*', 'main')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Italic"><Italic className="w-4 h-4" /></button>
                <button type="button" onClick={() => applyFormatting('~~', '~~', 'main')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button type="button" onClick={() => applyFormatting('`', '`', 'main')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Code"><Code className="w-4 h-4" /></button>
                <button type="button" onClick={() => applyFormatting('> ', '', 'main')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Quote"><Quote className="w-4 h-4" /></button>
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <button type="button" onClick={() => handleCreateMeetLink('main')} disabled={isCreatingMeet} className="p-1.5 hover:bg-teal-50 rounded text-slate-500 hover:text-teal-600 transition-colors disabled:opacity-50 flex items-center gap-1" title="Generate Google Meet Link">
                   {isCreatingMeet ? <div className="w-4 h-4 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" /> : <Video className="w-4 h-4" />}
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isMuted}
              placeholder={isMuted ? "You have been muted in this channel." : `${t("chat.placeholder")} (${name})`}
              className="w-full min-h-[56px] max-h-[200px] resize-none bg-transparent border-none focus:ring-0 text-[15px] text-slate-800 placeholder:text-slate-400 p-4 disabled:opacity-50 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <div className="flex items-center gap-1">
                <label
                  className={cn("p-2 rounded-lg transition-colors text-slate-500", isMuted ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-slate-100")}
                  title="Attach file"
                >
                  <Paperclip className="w-5 h-5" />
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading || showConfirmDialog || isMuted}
                  />
                </label>
                <div
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 relative cursor-pointer"
                  title="Emoji"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <SmilePlus className="w-5 h-5" />
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-slate-100 rounded-2xl shadow-xl p-2 z-50 grid grid-cols-5 gap-1 w-56">
                      {[
                        "😀",
                        "😂",
                        "😍",
                        "🤔",
                        "👍",
                        "🔥",
                        "🚀",
                        "✨",
                        "👀",
                        "🎉",
                      ].map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInputValue((prev) => prev + emoji);
                            setShowEmojiPicker(false);
                          }}
                          className="p-2 hover:bg-slate-100 rounded-lg text-lg transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="p-2 bg-workspace-accent text-white rounded-lg shadow-sm hover:bg-workspace-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </form>
          <p className="text-[10px] text-slate-400 mt-2 ml-4 font-mono text-center">
            SwiftyDrop Secure Transfer Active
          </p>
        </div>

        {isUploading && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-slate-100"
                  />
                  <motion.circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-workspace-accent"
                    strokeDasharray="226.2"
                    initial={{ strokeDashoffset: 226.2 }}
                    animate={{
                      strokeDashoffset: 226.2 - (226.2 * uploadProgress) / 100,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-black text-slate-700">
                    {uploadProgress}%
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-bold text-slate-800">
                  {uploadProgress === 100
                    ? "Sync Complete"
                    : "Encrypting & Streaming..."}
                </p>
                <p className="text-[10px] text-slate-400 font-mono italic">
                  Fragmented Peer Transfer
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        <AnimatePresence>
          {showConfirmDialog && pendingFile && (
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-slate-100"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 border border-blue-100">
                    {getFileIcon(pendingFile.name)}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {t("chat.confirmFile")}
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    {t("chat.confirmFileMessage")}
                  </p>

                  <div className="w-full bg-slate-50 rounded-xl p-4 mb-8 text-left border border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      File Info
                    </p>
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {pendingFile.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(pendingFile.size)}
                    </p>
                  </div>

                  <div className="flex flex-col w-full gap-3">
                    <button
                      onClick={confirmUpload}
                      className="w-full py-3 bg-workspace-accent text-white rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-workspace-accent/20"
                    >
                      {t("chat.confirmSend")}
                    </button>
                    <button
                      onClick={cancelUpload}
                      className="w-full py-3 bg-white text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Thread Panel */}
      <AnimatePresence>
        {activeThread && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="h-full bg-slate-50 border-l border-slate-200 flex flex-col z-20"
          >
            <div className="h-16 px-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-10 shrink-0">
              <h3 className="font-bold text-slate-800">Thread</h3>
              <button
                onClick={() => setActiveThread(null)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Parent Message */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <button
                    onClick={() => openProfile(activeThread.senderId)}
                    className="w-8 h-8 rounded-full bg-workspace-accent/10 flex items-center justify-center font-bold text-workspace-accent text-xs cursor-pointer hover:ring-2 hover:ring-workspace-accent transition-all"
                  >
                    {(activeThread.senderName || "").charAt(0)}
                  </button>
                  <div className="flex-1">
                    <button
                      onClick={() => openProfile(activeThread.senderId)}
                      className="font-bold text-sm text-slate-800 cursor-pointer hover:underline"
                    >
                      {activeThread.senderName}
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {activeThread.content}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px bg-slate-200 flex-1"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {threadMessages.length} replies
                </span>
                <div className="h-px bg-slate-200 flex-1"></div>
              </div>

              {/* Thread Replies */}
              {threadMessages.map((msg) => {
                const canDeleteThreadMsg =
                  msg.senderId === user?.uid || isChannelAdmin;
                return (
                  <div
                    key={msg.id}
                    className="flex flex-col gap-1 group/thread-msg relative"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openProfile(msg.senderId)}
                        className="font-bold text-xs text-slate-800 cursor-pointer hover:underline"
                      >
                        {msg.senderName}
                      </button>
                      <span className="text-[9px] text-slate-400">
                        {format(msg.timestamp, "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="bg-white px-3 py-2 rounded-xl text-sm border border-slate-100 w-fit max-w-[90%]">
                        <Suspense
                          fallback={
                            <div className="markdown-body text-inherit leading-relaxed whitespace-pre-wrap break-words">
                              {msg.content}
                            </div>
                          }
                        >
                          <MessageMarkdown content={msg.content} isMe={false} />
                        </Suspense>
                      </div>
                      {canDeleteThreadMsg && (
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="opacity-0 group-hover/thread-msg:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={threadMessagesEndRef} />
              <AnimatePresence>
                {typingUsers.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -5 }}
                    className="flex items-center gap-1.5 p-2"
                  >
                    <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_0ms]" />
                    <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_200ms]" />
                    <div className="w-1 h-1 rounded-full bg-workspace-accent animate-[bounce_1s_infinite_400ms]" />
                    <span className="text-[9px] font-bold text-workspace-accent italic">
                      {typingUsers.length === 1
                        ? `${typingUsers[0].userName} is typing...`
                        : typingUsers.length === 2
                          ? `${typingUsers[0].userName} & ${typingUsers[1].userName} are typing...`
                          : `${typingUsers[0].userName} & ${typingUsers.length - 1} others typing...`}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Thread Input */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendThreadMessage();
                }}
                className="flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm focus-within:ring-4 focus-within:ring-workspace-accent/10 focus-within:border-workspace-accent transition-all duration-200"
              >
                {!isMuted && (
                  <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b border-slate-50">
                    <button type="button" onClick={() => applyFormatting('**', '**', 'thread')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Bold"><Bold className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => applyFormatting('*', '*', 'thread')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Italic"><Italic className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => applyFormatting('~~', '~~', 'thread')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Strikethrough"><Strikethrough className="w-3.5 h-3.5" /></button>
                    <div className="w-px h-3 bg-slate-200 mx-1" />
                    <button type="button" onClick={() => applyFormatting('`', '`', 'thread')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Code"><Code className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => applyFormatting('> ', '', 'thread')} className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors" title="Quote"><Quote className="w-3.5 h-3.5" /></button>
                    <div className="w-px h-3 bg-slate-200 mx-1" />
                    <button type="button" onClick={() => handleCreateMeetLink('thread')} disabled={isCreatingMeet} className="p-1.5 hover:bg-teal-50 rounded text-slate-500 hover:text-teal-600 transition-colors disabled:opacity-50 flex items-center gap-1" title="Generate Google Meet Link">
                       {isCreatingMeet ? <div className="w-3.5 h-3.5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
                <textarea
                  ref={threadInputRef}
                  rows={1}
                  value={threadInputValue}
                  onChange={handleThreadInputChange}
                  onKeyDown={(e) => {
                    handleKeyDown(e);
                    if (e.key === 'Enter' && !e.shiftKey && !showMentions) {
                      e.preventDefault();
                      sendThreadMessage();
                    }
                  }}
                  disabled={isMuted}
                  placeholder={isMuted ? "Muted." : "Reply in thread..."}
                  className="w-full min-h-[44px] max-h-[150px] resize-none bg-transparent border-none text-[13px] focus:ring-0 px-4 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex justify-end p-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={!threadInputValue.trim() || isMuted}
                    className="p-1.5 bg-workspace-accent text-white rounded-lg hover:bg-workspace-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMembersModal && currentChannel && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-workspace-accent" />
                  <h3 className="font-bold text-slate-800">
                    {isAddingMembers ? "Add Members" : "Channel Members"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {!isAddingMembers && isChannelAdmin && type === 'channel' && (
                    <button
                      onClick={() => setIsAddingMembers(true)}
                      className="p-2 hover:bg-workspace-accent/10 rounded-lg transition-colors text-workspace-accent"
                      title="Add Members"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (isAddingMembers) {
                        setIsAddingMembers(false);
                        setMemberSearchQuery("");
                      } else {
                        setShowMembersModal(false);
                      }
                    }}
                    className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {isAddingMembers ? (
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search users..."
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-workspace-accent/30 focus:border-workspace-accent transition-all"
                    />
                  </div>
                </div>
              ) : null}

              <div className="max-h-96 overflow-y-auto p-4 space-y-2">
                {isAddingMembers ? (
                  workspaceUsers
                    .filter(u => !currentChannel.members.includes(u.id))
                    .filter(u => u.name.toLowerCase().includes(memberSearchQuery.toLowerCase()))
                    .map(uUser => (
                      <div key={uUser.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-workspace-accent/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                            {uUser.avatar ? <img src={uUser.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">{uUser.name.charAt(0)}</div>}
                          </div>
                          <p className="text-sm font-bold text-slate-800 leading-tight">
                            {uUser.name}
                          </p>
                        </div>
                        <button
                          onClick={() => addUserToChannel(uUser.id)}
                          className="px-3 py-1.5 bg-workspace-accent/10 hover:bg-workspace-accent text-workspace-accent hover:text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    ))
                ) : (
                  currentChannel.members.map(memberId => {
                    const mUser = workspaceUsers.find(u => u.id === memberId);
                    const mIsAdmin = channelAdmins.includes(memberId) || mUser?.role === UserRole.ADMIN;
                    const mIsMuted = channelMutedMembers.includes(memberId);
                    if (!mUser) return null;
                    
                    return (
                      <div key={memberId} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-workspace-accent/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                            {mUser.avatar ? <img src={mUser.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">{mUser.name.charAt(0)}</div>}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">
                              {mUser.name} {memberId === user?.uid && <span className="text-[10px] text-workspace-accent ml-1">(You)</span>}
                            </p>
                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                              {mIsAdmin && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-black">Admin</span>}
                              {mIsMuted && <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-black">Muted</span>}
                            </p>
                          </div>
                        </div>
                        
                        {isChannelAdmin && memberId !== user?.uid && !mIsAdmin && (
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleMuteUser(memberId)}
                              className={cn("p-1.5 rounded-lg transition-colors border shadow-sm", mIsMuted ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" : "bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-50")}
                              title={mIsMuted ? "Unmute User" : "Mute User"}
                            >
                              <VolumeX className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => removeUserFromChannel(memberId)}
                              className="p-1.5 bg-white text-slate-400 border border-slate-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-sm"
                              title="Remove User"
                            >
                              <UserMinus className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Channel Modal */}
      <AnimatePresence>
        {isEditingChannel && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-[110] p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white border border-slate-200 rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Edit Channel</h2>
                    <p className="text-slate-500 text-xs mt-1">Update channel details and icon.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setIsEditingChannel(false);
                      setChannelError(null);
                      setShowChannelIconPicker(false);
                    }}
                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleUpdateChannel} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Channel Name
                    </label>
                    <div className="relative">
                      <Hash className={cn("absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400", channelError && "text-red-500")} />
                      <input 
                        autoFocus
                        type="text" 
                        value={editingChannelName}
                        onChange={(e) => {
                          setEditingChannelName(e.target.value);
                          if (channelError) setChannelError(null);
                        }}
                        placeholder="e.g. strategy-hub"
                        className={cn("w-full bg-slate-50 border rounded-xl py-3 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 transition-all", channelError ? "border-red-500/50 focus:ring-red-500/50" : "border-slate-200 focus:ring-workspace-accent/50")}
                        required
                      />
                    </div>
                    {channelError && (
                      <p className="text-xs text-red-500 mt-2 flex items-start gap-1.5">
                        <span className="shrink-0">⚠️</span>
                        <span>{channelError}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Channel Icon
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowChannelIconPicker(!showChannelIconPicker)}
                        className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {React.createElement(ICONS[editingChannelIcon as IconName] || Hash, { className: "w-5 h-5 text-workspace-accent" })}
                          <span>{editingChannelIcon}</span>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 text-slate-400 transition-transform", showChannelIconPicker && "rotate-90")} />
                      </button>
                      
                      <AnimatePresence>
                        {showChannelIconPicker && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            className="absolute top-[110%] left-0 w-full z-10 bg-white border border-slate-200 rounded-xl shadow-2xl p-2 max-h-48 overflow-y-auto no-scrollbar grid grid-cols-6 gap-1"
                          >
                            {(Object.keys(ICONS) as IconName[]).map((iconName) => (
                              <button
                                key={iconName}
                                type="button"
                                onClick={() => {
                                  setEditingChannelIcon(iconName);
                                  setShowChannelIconPicker(false);
                                }}
                                className={cn(
                                  "p-2 rounded-lg flex items-center justify-center transition-all",
                                  editingChannelIcon === iconName ? "bg-workspace-accent text-white" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                                )}
                                title={iconName}
                              >
                                {React.createElement(ICONS[iconName], { className: "w-4 h-4" })}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Description <span className="text-slate-400">(Optional)</span>
                    </label>
                    <textarea 
                      value={editingChannelDesc}
                      onChange={(e) => setEditingChannelDesc(e.target.value)}
                      placeholder="What is this channel about?"
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-workspace-accent/50 transition-all resize-none"
                    />
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between group cursor-pointer" onClick={() => setEditingChannelIsPrivate(!editingChannelIsPrivate)}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        editingChannelIsPrivate ? "bg-amber-500/10 text-amber-500" : "bg-slate-200 text-slate-500"
                      )}>
                        {editingChannelIsPrivate ? <Lock className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">Private Channel</p>
                        <p className="text-[10px] text-slate-500">Only visible to invited members</p>
                      </div>
                    </div>
                    <div className={cn(
                      "w-10 h-5 rounded-full relative transition-all duration-300",
                      editingChannelIsPrivate ? "bg-amber-500" : "bg-slate-200"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300",
                        editingChannelIsPrivate ? "left-6" : "left-1"
                      )} />
                    </div>
                  </div>

                  <div className="pt-4 flex gap-3">
                    <button 
                      type="button"
                      onClick={() => {
                        setIsEditingChannel(false);
                        setChannelError(null);
                      }}
                      className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      disabled={isSavingChannel || !editingChannelName.trim()}
                      className="flex-[2] py-3 px-4 bg-workspace-accent text-white rounded-xl text-sm font-bold shadow-xl shadow-workspace-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isSavingChannel ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
