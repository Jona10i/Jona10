import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Building2, Shield, Circle, Monitor, Clock, ChevronDown, LogOut, UploadCloud } from 'lucide-react';
import { db, storage } from '../lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { User, UserRole, CompanyType } from '../types';
import { useFirebase } from './FirebaseProvider';
import { updateDoc } from 'firebase/firestore';
import { cn, formatDistanceToNow } from '../lib/utils';

interface UserProfileContextType {
  openProfile: (userId: string) => void;
  closeProfile: () => void;
}

const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

export const UserProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAtLeast, logOut } = useFirebase();
  const isAdmin = isAtLeast(UserRole.ADMIN);
  const [isOpen, setIsOpen] = useState(false);
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [localCompanyName, setLocalCompanyName] = useState('');
  
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (userData) {
      setLocalCompanyName(userData.companyName || '');
    }
  }, [userData]);

  const handleRoleChange = async (newRole: UserRole) => {
    if (!userData || !isAdmin) return;
    setSavingRole(true);
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        role: newRole
      });
      setUserData({ ...userData, role: newRole });
    } catch (err) {
      console.error("Failed to update role", err);
    } finally {
      setSavingRole(false);
    }
  };

  const handleCompanyNameChange = async (newName: string) => {
    if (!userData || !isAdmin) return;
    setSavingRole(true);
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        companyName: newName
      });
      setUserData({ ...userData, companyName: newName });
    } catch (err) {
      console.error("Failed to update company name", err);
    } finally {
      setSavingRole(false);
    }
  };

  const handleCompanyTypeChange = async (newType: CompanyType) => {
    if (!userData || !isAdmin) return;
    setSavingRole(true);
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        companyType: newType
      });
      setUserData({ ...userData, companyType: newType });
    } catch (err) {
      console.error("Failed to update company type", err);
    } finally {
      setSavingRole(false);
    }
  };

  const updateAvatar = async (newAvatarUrl: string) => {
    if (!userData) return;
    try {
      await updateDoc(doc(db, 'users', userData.id), {
        avatar: newAvatarUrl
      });
      setUserData({ ...userData, avatar: newAvatarUrl });
      setShowAvatarSelector(false);
    } catch (err) {
      console.error("Failed to update avatar", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userData) return;

    if (!file.type.startsWith('image/')) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image is too large. Formats under 5MB are accepted.");
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarUploadProgress(0);

    const storageRef = ref(storage, `avatars/${userData.id}_${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        setAvatarUploadProgress(progress);
      },
      (error) => {
        console.error("Failed to upload avatar", error);
        alert("Failed to upload avatar");
        setIsUploadingAvatar(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        await updateAvatar(downloadUrl);
        setIsUploadingAvatar(false);
      }
    );
  };

  useEffect(() => {
    if (!isOpen || !selectedUserId) return;

    const fetchUser = async () => {
      setLoading(true);
      try {
        const userRef = doc(db, 'users', selectedUserId);
        const snapshot = await getDoc(userRef);
        if (snapshot.exists()) {
          setUserData({ id: snapshot.id, ...snapshot.data() } as User);
        } else {
          setUserData(null);
        }
      } catch (err) {
        console.error("Failed to fetch user profile", err);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [isOpen, selectedUserId]);

  const openProfile = (userId: string) => {
    setSelectedUserId(userId);
    setIsOpen(true);
  };

  const closeProfile = () => {
    setIsOpen(false);
    setTimeout(() => {
      setUserData(null);
      setSelectedUserId(null);
    }, 300);
  };

  return (
    <UserProfileContext.Provider value={{ openProfile, closeProfile }}>
      {children}

      <AnimatePresence>
        {showAvatarSelector && (
          <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2rem] p-6 max-w-sm w-full shadow-2xl"
            >
              <h3 className="text-lg font-bold text-slate-800 mb-4">Select Avatar</h3>

              <div className="mb-4">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  disabled={isUploadingAvatar}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="w-full py-3 px-4 flex items-center justify-center gap-2 bg-workspace-accent text-white font-bold rounded-xl hover:bg-workspace-accent/90 transition-all disabled:opacity-50 relative overflow-hidden"
                >
                  <UploadCloud className="w-5 h-5" />
                  {isUploadingAvatar ? 'Uploading...' : 'Upload Image'}
                  {isUploadingAvatar && (
                    <div 
                      className="absolute bottom-0 left-0 h-1 bg-white/30 transition-all duration-300"
                      style={{ width: `${avatarUploadProgress}%` }}
                    />
                  )}
                </button>
              </div>

              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-bold uppercase tracking-wider">Or choose preset</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale1',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale2',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale3',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale4',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale5',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalFemale6',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale1',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale2',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale3',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale4',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale5',
                  'https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=ProfessionalMale6',
                ].map((url) => (
                  <button
                    key={url}
                    onClick={() => updateAvatar(url)}
                    className="w-full aspect-square rounded-2xl overflow-hidden hover:ring-2 hover:ring-workspace-accent transition-all"
                  >
                    <img src={url} alt="Avatar" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAvatarSelector(false)}
                className="mt-6 w-full py-3 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 transition-colors text-slate-700"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeProfile}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl overflow-hidden"
            >
              <button 
                onClick={closeProfile}
                className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <div className="w-10 h-10 border-4 border-slate-100 border-t-workspace-accent rounded-full animate-spin mb-4" />
                  <p className="text-sm text-slate-500 animate-pulse">Loading profile...</p>
                </div>
              ) : userData ? (
                <div className="flex flex-col items-center pt-4">
                  <div className="relative mb-6 group">
                    <div 
                      className={cn(
                        "w-28 h-28 rounded-[2rem] bg-gradient-to-br from-workspace-accent to-blue-600 p-1 shadow-xl shadow-workspace-accent/20",
                        userData?.id === profile?.id && "cursor-pointer group-hover:ring-4 group-hover:ring-workspace-accent/20 transition-all"
                      )}
                      onClick={() => userData?.id === profile?.id && setShowAvatarSelector(true)}
                    >
                      <div className="w-full h-full bg-white rounded-[1.8rem] overflow-hidden relative">
                        {userData.avatar ? (
                          <img src={userData.avatar} alt={userData.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-400 font-bold text-4xl">
                            {(userData.name || "").charAt(0).toUpperCase()}
                          </div>
                        )}
                        {userData.id === profile?.id && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <span className="text-white text-xs font-bold">Edit</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-xl border-4 border-white flex items-center justify-center shadow-sm ${
                      userData.status === 'online' ? 'bg-green-500 text-white' : 
                      userData.status === 'away' ? 'bg-amber-400 text-white' : 'bg-slate-300 text-transparent'
                    }`}>
                      <Monitor className="w-4 h-4" />
                    </div>
                  </div>

                  <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">
                    {userData.name}
                  </h2>
                  <p className="text-slate-500 font-medium mb-8">
                    {userData.email}
                  </p>

                  <div className="w-full space-y-3">
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-workspace-accent">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">Department</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{userData.department || 'General'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-500">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">Company Name</p>
                        {isAdmin ? (
                          <input 
                            value={localCompanyName} 
                            onChange={(e) => setLocalCompanyName(e.target.value)}
                            onBlur={() => handleCompanyNameChange(localCompanyName)}
                            disabled={savingRole}
                            placeholder="Enter company name..."
                            className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none disabled:opacity-50"
                          />
                        ) : (
                          <p className="text-sm font-bold text-slate-800 uppercase">{userData.companyName || 'Corporate Workspace'}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-teal-500">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">Company Type</p>
                        {isAdmin ? (
                          <div className="relative group">
                            <select 
                              value={userData.companyType || CompanyType.OTHER} 
                              onChange={(e) => handleCompanyTypeChange(e.target.value as CompanyType)}
                              disabled={savingRole}
                              className="w-full appearance-none bg-transparent text-sm font-bold text-slate-800 uppercase outline-none cursor-pointer disabled:opacity-50 pr-6 relative z-10"
                            >
                              <option value={CompanyType.TECH}>Tech</option>
                              <option value={CompanyType.FINANCE}>Finance</option>
                              <option value={CompanyType.HEALTHCARE}>Healthcare</option>
                              <option value={CompanyType.OTHER}>Other</option>
                            </select>
                            {!savingRole && (
                              <ChevronDown className="absolute right-0 top-[2px] w-4 h-4 text-slate-400 group-hover:text-teal-500 transition-colors pointer-events-none z-0" />
                            )}
                            {savingRole && <span className="absolute right-0 top-1 text-[10px] animate-pulse text-teal-500 uppercase font-black">Saving...</span>}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-slate-800 uppercase">{userData.companyType || 'Other'}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-indigo-500">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">Role</p>
                        {isAdmin ? (
                          <div className="relative group">
                            <select 
                              value={userData.role || UserRole.MEMBER} 
                              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                              disabled={savingRole || userData.id === profile?.id}
                              className="w-full appearance-none bg-transparent text-sm font-bold text-slate-800 uppercase outline-none cursor-pointer disabled:opacity-50 pr-6 relative z-10"
                            >
                              <option value={UserRole.ADMIN}>Admin</option>
                              <option value={UserRole.MEMBER}>Member</option>
                              <option value={UserRole.GUEST}>Guest</option>
                            </select>
                            {!savingRole && userData.id !== profile?.id && (
                              <ChevronDown className="absolute right-0 top-[2px] w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors pointer-events-none z-0" />
                            )}
                            {savingRole && <span className="absolute right-0 top-1 text-[10px] animate-pulse text-indigo-500 uppercase font-black">Saving...</span>}
                          </div>
                        ) : (
                          <p className="text-sm font-bold text-slate-800 uppercase">{userData.role || 'Member'}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-slate-500">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-0.5">Activity</p>
                        <p className="text-sm font-bold text-slate-800 capitalize">
                          {userData.status === 'online' ? 'Online Now' : 
                           `Seen ${userData.lastSeen ? formatDistanceToNow(userData.lastSeen, { addSuffix: true }) : 'unknown'}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {userData.id === profile?.id && (
                    <div className="w-full mt-6 pt-6 border-t border-slate-100">
                      <button
                        onClick={async () => {
                          closeProfile();
                          await logOut();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4">
                    <Circle className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">User Not Found</h3>
                  <p className="text-sm text-slate-500">This profile might have been deleted.</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </UserProfileContext.Provider>
  );
};

export const useUserProfile = () => {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used within UserProfileProvider");
  }
  return context;
};
